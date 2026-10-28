import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Mail, Phone, Shield, Lock, Eye, EyeOff,
  MapPin, Leaf, Plus, Edit3, CheckCircle, Building
} from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { farmsApi } from '@/api/index';
import api from '@/config/axios';
import { ROLES } from '@/config/constants';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import OpenStreetMapField from '@/components/maps/OpenStreetMapField';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Must include uppercase, lowercase, and a number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

const farmSchema = z.object({
  farmName: z.string().min(2, 'Farm name must be at least 2 characters'),
  description: z.string().optional(),
  totalArea: z.coerce.number().min(0.1, 'Valid area required'),
  areaUnit: z.enum(['acres', 'hectares', 'bigha', 'guntha']),
  address: z.string().optional(),
  village: z.string().optional(),
  district: z.string().min(2, 'District required'),
  state: z.string().min(2, 'State required'),
  pincode: z.string().regex(/^\d{6}$/, 'Valid 6-digit Indian PIN code required'),
  crops: z.string().optional(),
  certifications: z.string().optional(),
  accountHolder: z.string().optional(),
  bankName: z.string().optional(),
  ifscCode: z.string().optional(),
  upiId: z.string().optional(),
});

const Profile = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [isFarmModalOpen, setIsFarmModalOpen] = useState(false);
  const [farmCoordinates, setFarmCoordinates] = useState(null);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  const isFarmer = user?.role === ROLES.FARMER;

  // Farm query for farmers
  const { data: farmData, isLoading: farmLoading } = useQuery({
    queryKey: ['farm', 'mine'],
    queryFn: () => farmsApi.getMine(),
    select: (r) => r.data.data?.farm,
    enabled: isFarmer,
    retry: false,
  });

  // Password form
  const {
    register: regPass,
    handleSubmit: handlePassSubmit,
    reset: resetPass,
    formState: { errors: passErrors, isSubmitting: passSubmitting },
  } = useForm({ resolver: zodResolver(passwordSchema) });

  const onPasswordSubmit = async (data) => {
    try {
      await api.put('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success('Password updated successfully! Please keep it secure.');
      resetPass();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    }
  };

  // Farm form
  const {
    register: regFarm,
    handleSubmit: handleFarmSubmit,
    reset: resetFarm,
    setValue: setFarmValue,
    formState: { errors: farmErrors, isSubmitting: farmSubmitting },
  } = useForm({
    resolver: zodResolver(farmSchema),
    defaultValues: {
      areaUnit: 'acres',
      farmName: '',
      totalArea: '',
      state: '',
      district: '',
      pincode: '',
    },
  });

  const openFarmModal = (existingFarm = null) => {
    if (existingFarm) {
      setFarmCoordinates(existingFarm.location?.coordinates?.coordinates || null);
      setFarmValue('farmName', existingFarm.farmName || '');
      setFarmValue('description', existingFarm.description || '');
      setFarmValue('totalArea', existingFarm.totalArea || '');
      setFarmValue('areaUnit', existingFarm.areaUnit || 'acres');
      setFarmValue('address', existingFarm.location?.address || '');
      setFarmValue('village', existingFarm.location?.village || '');
      setFarmValue('district', existingFarm.location?.district || '');
      setFarmValue('state', existingFarm.location?.state || '');
      setFarmValue('pincode', existingFarm.location?.pincode || '');
      setFarmValue('crops', existingFarm.crops?.join(', ') || '');
      setFarmValue('certifications', existingFarm.certifications?.join(', ') || '');
      setFarmValue('accountHolder', existingFarm.bankDetails?.accountHolder || '');
      setFarmValue('bankName', existingFarm.bankDetails?.bankName || '');
      setFarmValue('ifscCode', existingFarm.bankDetails?.ifscCode || '');
      setFarmValue('upiId', existingFarm.bankDetails?.upiId || '');
    } else {
      resetFarm();
      setFarmCoordinates(null);
    }
    setIsFarmModalOpen(true);
  };

  const farmMutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        farmName: data.farmName,
        description: data.description || '',
        totalArea: Number(data.totalArea),
        areaUnit: data.areaUnit,
        location: {
          address: data.address || '',
          village: data.village || '',
          district: data.district,
          state: data.state,
          pincode: data.pincode,
          ...(farmCoordinates ? { coordinates: { type: 'Point', coordinates: farmCoordinates } } : {}),
        },
        crops: data.crops ? data.crops.split(',').map((c) => c.trim()).filter(Boolean) : [],
        certifications: data.certifications ? data.certifications.split(',').map((c) => c.trim()).filter(Boolean) : [],
        bankDetails: {
          accountHolder: data.accountHolder || '',
          bankName: data.bankName || '',
          ifscCode: data.ifscCode || '',
          upiId: data.upiId || '',
        },
      };

      if (farmData?._id) {
        return farmsApi.update(farmData._id, payload);
      }
      return farmsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['farm', 'mine'] });
      toast.success(farmData ? 'Farm profile updated!' : 'Farm profile created!');
      setIsFarmModalOpen(false);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to save farm profile');
    },
  });

  return (
    <div className="page animate-fade-in profile-page">
      <header className="profile-page-heading">
        <div><span className="profile-page-kicker"><Leaf size={13} /> YOUR FARM-E ACCOUNT</span><h1>Account &amp; profile</h1><p>Keep your contact, security, and farm details up to date.</p></div>
        <span className="profile-account-type">{isFarmer ? 'Farmer account' : 'Buyer account'}</span>
      </header>

      <div className="profile-grid grid grid-cols-1 lg:grid-cols-2">
        {/* Left Column: Account Details */}
        <div className="profile-account-column">
          <div className="card profile-account-card p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="profile-avatar w-14 h-14 rounded-2xl bg-primary-600 flex items-center justify-center text-white text-xl font-bold shadow-glow-green">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <h2 className="font-display font-bold text-lg text-gray-900 truncate">{user?.name}</h2>
                <span className="profile-role-badge mt-1">{user?.role}</span>
              </div>
            </div>

            <div className="profile-contact-list space-y-3.5 border-t border-gray-100 pt-4 text-sm">
              <div className="flex items-center gap-3 text-gray-600">
                <Mail size={16} className="text-gray-400 shrink-0" />
                <span className="truncate">{user?.email}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <Phone size={16} className="text-gray-400 shrink-0" />
                <span>{user?.phone ? `+91 ${user.phone}` : 'Phone number not added'}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <Shield size={16} className="text-gray-400 shrink-0" />
                <span>Account status: <strong className="text-green-600 font-semibold">Active</strong></span>
              </div>
            </div>
          </div>

          {/* Change Password Card */}
          <div className="card profile-security-card p-6">
            <h2 className="font-display font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Lock size={18} className="text-primary-600" /> Security
            </h2>
            <form onSubmit={handlePassSubmit(onPasswordSubmit)} className="space-y-3.5">
              <div className="relative">
                <Input
                  label="Current Password"
                  type={showCurrentPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  error={passErrors.currentPassword?.message}
                  {...regPass('currentPassword')}
                />
                <button
                  type="button"
                  aria-label={showCurrentPass ? 'Hide current password' : 'Show current password'}
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
                >
                  {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div className="relative">
                <Input
                  label="New Password"
                  type={showNewPass ? 'text' : 'password'}
                  placeholder="At least 8 chars"
                  error={passErrors.newPassword?.message}
                  {...regPass('newPassword')}
                />
                <button
                  type="button"
                  aria-label={showNewPass ? 'Hide new password' : 'Show new password'}
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
                >
                  {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <Input
                label="Confirm New Password"
                type="password"
                placeholder="Repeat password"
                error={passErrors.confirmPassword?.message}
                {...regPass('confirmPassword')}
              />

              <Button type="submit" loading={passSubmitting} size="sm" className="w-full mt-2">
                Update Password
              </Button>
            </form>
          </div>
        </div>

        {/* Right Column: Farm Profile (Farmers) or Overview */}
        <div className="profile-detail-column">
          {isFarmer ? (
            <div className="card profile-farm-card p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center text-primary-600">
                    <Leaf size={20} />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-lg text-gray-900">Farm Profile</h2>
                    <p className="text-xs text-gray-500">Your agricultural setup and location details</p>
                  </div>
                </div>

                {farmData && (
                  <Button variant="outline" size="sm" onClick={() => openFarmModal(farmData)} className="gap-1.5">
                    <Edit3 size={15} /> Edit Farm
                  </Button>
                )}
              </div>

              {farmLoading ? (
                <PageSpinner />
              ) : farmData ? (
                <div className="space-y-6">
                  {/* Farm Header */}
                  <div className="profile-farm-overview bg-primary-50/50 rounded-2xl p-5 border border-primary-100/60">
                    <h3 className="font-display font-bold text-xl text-primary-950">{farmData.farmName}</h3>
                    {farmData.description && (
                      <p className="text-sm text-primary-800/80 mt-1">{farmData.description}</p>
                    )}
                    <div className="profile-farm-stats flex flex-wrap gap-4 mt-4 pt-3 border-t border-primary-200/40 text-sm">
                      <div>
                        <span className="text-xs text-primary-600 block">Total Area</span>
                        <strong className="text-gray-900">{farmData.totalArea} {farmData.areaUnit}</strong>
                      </div>
                      <div>
                        <span className="text-xs text-primary-600 block">District</span>
                        <strong className="text-gray-900">{farmData.location?.district}, {farmData.location?.state}</strong>
                      </div>
                      <div>
                        <span className="text-xs text-primary-600 block">PIN Code</span>
                        <strong className="text-gray-900">{farmData.location?.pincode}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Location Details */}
                  <div>
                    <h4 className="font-display font-semibold text-sm text-gray-900 mb-3 flex items-center gap-2">
                      <MapPin size={16} className="text-primary-600" /> Farm Location
                    </h4>
                    <div className="profile-location-grid grid sm:grid-cols-2 gap-3 text-sm bg-gray-50 p-4 rounded-xl">
                      <div>
                        <span className="text-xs text-gray-400 block">Village / Landmark</span>
                        <span className="text-gray-800 font-medium">{farmData.location?.village || '—'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400 block">Street / Address</span>
                        <span className="text-gray-800 font-medium">{farmData.location?.address || '—'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400 block">District</span>
                        <span className="text-gray-800 font-medium">{farmData.location?.district}</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400 block">State</span>
                        <span className="text-gray-800 font-medium">{farmData.location?.state}</span>
                      </div>
                    </div>
                  </div>

                  {/* Crops Grown */}
                  {farmData.crops?.length > 0 && (
                    <div>
                      <h4 className="font-display font-semibold text-sm text-gray-900 mb-2">Crops Grown</h4>
                      <div className="flex flex-wrap gap-2">
                        {farmData.crops.map((c) => (
                          <span key={c} className="profile-crop-tag">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certifications */}
                  {farmData.certifications?.length > 0 && (
                    <div>
                      <h4 className="font-display font-semibold text-sm text-gray-900 mb-2">Certifications</h4>
                      <div className="flex flex-wrap gap-2">
                        {farmData.certifications.map((cert) => (
                          <span key={cert} className="profile-certification-tag">{cert}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bank / UPI Details */}
                  {farmData.bankDetails?.upiId && (
                    <div className="profile-bank-details bg-gray-50 p-4 rounded-xl text-sm">
                      <h4 className="font-display font-semibold text-xs text-gray-500 uppercase tracking-wider mb-2">
                        Payment & Bank Details
                      </h4>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">UPI ID:</span>
                        <strong className="text-gray-900">{farmData.bankDetails.upiId}</strong>
                      </div>
                      {farmData.bankDetails.bankName && (
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-gray-600">Bank:</span>
                          <span className="text-gray-800">{farmData.bankDetails.bankName}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* No Farm Profile Yet */
                <div className="profile-farm-empty text-center py-10 px-4 bg-primary-50/40 rounded-2xl border border-dashed border-primary-200">
                  <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center text-primary-600 mx-auto mb-4">
                    <Leaf size={32} />
                  </div>
                  <h3 className="font-display font-bold text-lg text-gray-900 mb-1">No Farm Profile Created Yet</h3>
                  <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
                    You need to set up your farm details before you can create listings for buyers to bid on.
                  </p>
                  <Button onClick={() => openFarmModal()} className="gap-2"><Plus size={16} /> Set Up Farm Profile Now</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="card profile-buyer-card p-6">
              <h2 className="font-display font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                <Building size={20} className="text-primary-600" /> Buyer Profile
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                As a registered buyer on Farm-E, you can publish procurement requirements, receive bids directly from farmers, negotiate terms, and buy crops with quality assurances.
              </p>
              <div className="p-4 bg-primary-50 rounded-xl flex items-center gap-3">
                <CheckCircle size={20} className="text-primary-600 shrink-0" />
                <span className="text-sm text-primary-900 font-medium">Verified Buyer Account — You can browse marketplace listings and place bids immediately.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Farm Create/Edit Modal */}
      <Modal
        isOpen={isFarmModalOpen}
        onClose={() => setIsFarmModalOpen(false)}
        title={farmData ? 'Edit Farm Profile' : 'Set Up Farm Profile'}
        size="lg"
      >
        <form onSubmit={handleFarmSubmit(farmMutation.mutate)} className="p-6 space-y-4">
          <Input
            label="Farm Name *"
            placeholder="e.g. Green Valley Organic Farm"
            error={farmErrors.farmName?.message}
            {...regFarm('farmName')}
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Total Land Area *"
              type="number"
              step="0.1"
              placeholder="e.g. 5"
              error={farmErrors.totalArea?.message}
              {...regFarm('totalArea')}
            />
            <Select label="Area Unit *" error={farmErrors.areaUnit?.message} {...regFarm('areaUnit')}>
              <option value="acres">Acres</option>
              <option value="hectares">Hectares</option>
              <option value="bigha">Bigha</option>
              <option value="guntha">Guntha</option>
            </Select>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="District *"
              placeholder="e.g. Nashik / Bangalore Rural"
              error={farmErrors.district?.message}
              {...regFarm('district')}
            />
            <Input
              label="State *"
              placeholder="e.g. Maharashtra / Karnataka"
              error={farmErrors.state?.message}
              {...regFarm('state')}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Village / Landmark"
              placeholder="e.g. Chandwad"
              error={farmErrors.village?.message}
              {...regFarm('village')}
            />
            <Input
              label="PIN Code *"
              placeholder="6-digit PIN code"
              error={farmErrors.pincode?.message}
              {...regFarm('pincode')}
            />
          </div>

          <Input
            label="Full Address / Farm Directions"
            placeholder="e.g. Survey No. 42, Near Canal Road"
            error={farmErrors.address?.message}
            {...regFarm('address')}
          />

          <OpenStreetMapField
            value={farmCoordinates}
            onChange={setFarmCoordinates}
            onLocationResolved={(location) => {
              [['address', location.address], ['village', location.village], ['district', location.district], ['state', location.state], ['pincode', location.pincode]]
                .forEach(([field, value]) => { if (value) setFarmValue(field, value, { shouldValidate: true }); });
            }}
            interactive
          />

          <Input
            label="Crops Grown (comma-separated)"
            placeholder="e.g. Onion, Tomato, Pomegranate, Wheat"
            error={farmErrors.crops?.message}
            {...regFarm('crops')}
          />

          <Input
            label="Certifications (optional)"
            placeholder="e.g. Organic, NPOP, Jaivik Bharat"
            error={farmErrors.certifications?.message}
            {...regFarm('certifications')}
          />

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Payment & Settlement Details
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="UPI ID (for receiving payments)"
                placeholder="e.g. ramesh@okaxis"
                error={farmErrors.upiId?.message}
                {...regFarm('upiId')}
              />
              <Input
                label="Bank Name (optional)"
                placeholder="e.g. State Bank of India"
                error={farmErrors.bankName?.message}
                {...regFarm('bankName')}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={() => setIsFarmModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={farmSubmitting || farmMutation.isPending}>
              {farmData ? 'Save Changes' : 'Create Farm Profile'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Profile;
