import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Leaf, Plus, ExternalLink, AlertCircle, ArrowRight, ImagePlus, X } from 'lucide-react';
import { listingsApi, farmsApi } from '@/api/index';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { CROP_CATEGORIES, QUALITY_CERTIFICATIONS, QUALITY_GRADES, UNITS } from '@/config/constants';
import toast from 'react-hot-toast';
import OpenStreetMapField from '@/components/maps/OpenStreetMapField';
import { useAuth } from '@/auth/useAuth';
import { useFormDraft } from '@/hooks/useFormDraft';

const schema = z.object({
  crop: z.object({
    name: z.string().trim().min(1, 'Crop name is required'),
    variety: z.string().trim().optional(),
    category: z.string().min(1, 'Crop category is required'),
  }),
  quantity: z.object({
    expected: z.preprocess(
      (v) => (v === '' || v === undefined ? undefined : Number(v)),
      z.number({ error: (issue) => issue.input === undefined ? 'Expected quantity is required' : 'Quantity must be a number' }).positive('Quantity must be greater than 0')
    ),
    unit: z.string().min(1, 'Unit is required'),
  }),
  pricePerUnit: z.object({
    expected: z.preprocess(
      (v) => (v === '' || v === undefined ? undefined : Number(v)),
      z.number({ error: (issue) => issue.input === undefined ? 'Expected price per unit is required' : 'Price must be a number' }).min(0, 'Price cannot be negative')
    ),
    minimum: z.preprocess(
      (v) => (v === '' || v === undefined ? undefined : Number(v)),
      z.number({ error: 'Minimum price must be a number' }).min(0, 'Minimum price cannot be negative').optional()
    ),
  }),
  quality: z.object({
    grade: z.string().min(1, 'Quality grade is required'),
    certifications: z.array(z.string()).optional(),
    description: z.string().trim().optional(),
  }),
  harvestDate: z.object({
    expected: z.string().min(1, 'Expected harvest date is required'),
  }),
  description: z.string().trim().optional(),
});

const getDefaultHarvestDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
};

const quickFarmSchema = z.object({
  farmName: z.string().min(2, 'Farm name required'),
  totalArea: z.coerce.number().min(0.1, 'Valid area required'),
  areaUnit: z.enum(['acres', 'hectares', 'bigha', 'guntha']),
  district: z.string().min(2, 'District required'),
  state: z.string().min(2, 'State required'),
  pincode: z.string().regex(/^\d{6}$/, 'Valid 6-digit PIN required'),
  village: z.string().optional(),
  address: z.string().optional(),
});

const CreateListing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [isFarmModalOpen, setIsFarmModalOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [farmCoordinates, setFarmCoordinates] = useState(null);
  const [photoFiles, setPhotoFiles] = useState([]);
  const photoUrlsRef = useRef(new Set());
  const photoInputRef = useRef(null);

  useEffect(() => () => photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const { data: farmData, isLoading: farmLoading } = useQuery({
    queryKey: ['farm', 'mine'],
    queryFn: () => farmsApi.getMine(),
    select: (r) => r.data.data,
    retry: false,
  });

  const {
    register: regFarm,
    handleSubmit: handleFarmSubmit,
    setValue: setFarmValue,
    formState: { errors: farmErrors, isSubmitting: farmSubmitting },
  } = useForm({
    resolver: zodResolver(quickFarmSchema),
    defaultValues: { areaUnit: 'acres', farmName: '', totalArea: '', state: '', district: '', pincode: '' },
  });

  const farmMutation = useMutation({
    mutationFn: (data) =>
      farmsApi.create({
        farmName: data.farmName,
        totalArea: Number(data.totalArea),
        areaUnit: data.areaUnit,
        location: {
          village: data.village || '',
          address: data.address || '',
          district: data.district,
          state: data.state,
          pincode: data.pincode,
          ...(farmCoordinates ? { coordinates: { type: 'Point', coordinates: farmCoordinates } } : {}),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['farm', 'mine'] });
      toast.success('Farm profile created! You can now create your listing.');
      setIsFarmModalOpen(false);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create farm profile'),
  });

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      crop: { category: 'Vegetables' },
      quantity: { unit: 'kg' },
      quality: { grade: 'A', certifications: [] },
      harvestDate: { expected: getDefaultHarvestDate() },
    },
  });
  const { register, handleSubmit, trigger, formState: { errors, isSubmitting } } = form;
  const { saveState, clearDraft } = useFormDraft(form, `listing:${user?._id || 'unknown'}`);

  const listingSteps = [
    { title: 'Crop details', description: 'What are you growing?', fields: ['crop.name', 'crop.category', 'quality.grade'] },
    { title: 'Quantity & price', description: 'Set your offer', fields: ['quantity.expected', 'quantity.unit', 'pricePerUnit.expected', 'pricePerUnit.minimum'] },
    { title: 'Harvest & publish', description: 'Set the timeline', fields: ['harvestDate.expected'] },
  ];
  const advanceListingStep = async () => {
    const current = listingSteps[activeStep];
    if (await trigger(current.fields)) setActiveStep((step) => Math.min(step + 1, listingSteps.length - 1));
  };

  const mutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        crop: {
          name: data.crop?.name,
          variety: data.crop?.variety || undefined,
          category: data.crop?.category,
        },
        quantity: {
          expected: Number(data.quantity?.expected),
          unit: data.quantity?.unit,
        },
        pricePerUnit: {
          expected: Number(data.pricePerUnit?.expected),
          minimum: data.pricePerUnit?.minimum !== undefined ? Number(data.pricePerUnit?.minimum) : undefined,
        },
        quality: {
          grade: data.quality?.grade,
          certifications: data.quality?.certifications || [],
          description: data.quality?.description || undefined,
        },
        harvestDate: {
          expected: data.harvestDate?.expected,
        },
        description: data.description || undefined,
      };
      const response = await listingsApi.create(payload);
      const listing = response.data.data.listing;
      if (!photoFiles.length) return { listing };
      try {
        const uploaded = await listingsApi.uploadImages(listing._id, photoFiles.map(({ file }) => file));
        return { listing: uploaded.data.data.listing };
      } catch (photoError) {
        return { listing, photoError };
      }
    },
    onSuccess: ({ photoError }) => {
      clearDraft();
      qc.invalidateQueries({ queryKey: ['listings', 'mine'] });
      if (photoError) {
        toast.error(`Listing created, but photos could not upload: ${photoError.response?.data?.message || 'Please try adding them from My listings.'}`, { duration: 6500 });
        navigate('/farmer/listings');
      } else {
        toast.success('Listing created successfully!');
        navigate('/farmer/listings');
      }
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create listing'),
  });

  const onInvalid = (fieldErrors) => {
    const findFirst = (obj, path = '') => {
      if (!obj) return null;
      if (obj.message) return { message: obj.message, path };
      for (const k of Object.keys(obj)) {
        const res = findFirst(obj[k], path ? `${path}.${k}` : k);
        if (res) return res;
      }
      return null;
    };
    const first = findFirst(fieldErrors);
    if (first) {
      toast.error(first.message);
      const el = document.querySelector(`[name="${first.path}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
      }
    } else {
      toast.error('Please fill in all required fields');
    }
  };

  if (farmLoading) {
    return <PageSpinner />;
  }

  if (!farmData?.farm) {
    return (
      <div className="page-sm animate-fade-in">
        <div className="card p-8 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center text-primary-600 mx-auto mb-4 shadow-sm">
            <Leaf size={32} />
          </div>
          <h2 className="section-title mb-2">Set up your farm profile first</h2>
          <p className="text-sm text-gray-500 mb-6">
            Buyers need to see where produce is grown. Add your farm details in 30 seconds to start creating listings.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => setIsFarmModalOpen(true)} className="gap-2">
              <Plus size={16} /> Set Up Farm Profile Now
            </Button>
            <Button variant="outline" onClick={() => navigate('/profile')} className="gap-2">
              Go to Full Profile <ExternalLink size={14} />
            </Button>
          </div>
        </div>

        {/* Quick Farm Setup Modal */}
        <Modal
          isOpen={isFarmModalOpen}
          onClose={() => setIsFarmModalOpen(false)}
          title="Create Farm Profile"
          size="md"
        >
          <form onSubmit={handleFarmSubmit((data) => farmMutation.mutate(data))} className="p-6 space-y-4">
            <Input
              label="Farm Name *"
              placeholder="e.g. Ramesh Organic Farm"
              error={farmErrors.farmName?.message}
              {...regFarm('farmName')}
            />

            <div className="grid grid-cols-2 gap-4">
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
              label="Address / Landmark"
              placeholder="Farm road, village or nearby landmark"
              {...regFarm('address')}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="District *"
                placeholder="e.g. Bangalore Rural"
                error={farmErrors.district?.message}
                {...regFarm('district')}
              />
              <Input
                label="State *"
                placeholder="e.g. Karnataka"
                error={farmErrors.state?.message}
                {...regFarm('state')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Village / Landmark"
                placeholder="e.g. Hoskote"
                error={farmErrors.village?.message}
                {...regFarm('village')}
              />
              <Input
                label="PIN Code *"
                placeholder="6-digit PIN"
                error={farmErrors.pincode?.message}
                {...regFarm('pincode')}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button type="button" variant="outline" onClick={() => setIsFarmModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={farmSubmitting || farmMutation.isPending}>
                Save Farm & Continue
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  return (
    <div className="page-sm animate-fade-in">
      <div className="mb-6">
        <span className="page-kicker">FARMER WORKSPACE / INVENTORY</span>
        <h1 className="section-title mt-1">Create a crop listing</h1>
        <p className="text-sm text-gray-500 mt-1">Add your crop details, set your offer, then publish when everything is ready.</p>
      </div>

      <div className="workflow-steps" aria-label="Listing steps">
        {listingSteps.map((item, index) => <div key={item.title} className={`workflow-step ${index === activeStep ? 'is-current' : index < activeStep ? 'is-complete' : ''}`}>
          <span className="workflow-step-number">{index < activeStep ? '✓' : `0${index + 1}`}</span>
          <span className="workflow-step-copy"><b>{item.title}</b><small>{item.description}</small></span>
          {index < listingSteps.length - 1 && <span className="workflow-step-line" />}
        </div>)}
      </div>

      <form onSubmit={handleSubmit((data) => mutation.mutate(data), onInvalid)} className="space-y-6">
        {/* Crop Info */}
        {activeStep === 0 && <div className="card p-6 workflow-panel">
          <h2 className="font-display font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Leaf size={18} className="text-primary-600" /> Crop Information
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Crop Name *" placeholder="e.g. Tomato" error={errors.crop?.name?.message || errors['crop.name']?.message} {...register('crop.name')} />
            <Input label="Variety" placeholder="e.g. Roma" error={errors.crop?.variety?.message} {...register('crop.variety')} />
            <Select label="Category *" error={errors.crop?.category?.message || errors['crop.category']?.message} {...register('crop.category')}>
              {CROP_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Select label="Quality Grade *" error={errors.quality?.grade?.message || errors['quality.grade']?.message} {...register('quality.grade')}>
              {QUALITY_GRADES.map((g) => <option key={g}>{g}</option>)}
            </Select>
          </div>
          <div className="mt-4">
            <span className="form-label">Certifications</span>
            <div className="mt-1 flex flex-wrap gap-4">
              {QUALITY_CERTIFICATIONS.map((certification) => <label key={certification} className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" value={certification} className="rounded text-primary-600" {...register('quality.certifications')} />
                {certification} (identify only if verified)
              </label>)}
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div><label className="form-label">Crop photos <span className="font-normal text-gray-400">(up to 5)</span></label><p className="text-xs text-gray-500">Clear photos help buyers assess your harvest.</p></div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(event) => {
                  const incoming = Array.from(event.target.files || []);
                  event.target.value = '';
                  const remaining = 5 - photoFiles.length;
                  const accepted = [];
                  for (const file of incoming) {
                    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                      toast.error(`${file.name}: choose a JPEG, PNG, or WebP photo`);
                    } else if (file.size > 5 * 1024 * 1024) {
                      toast.error(`${file.name}: photos must be 5 MB or smaller`);
                    } else if (photoFiles.length + accepted.length >= 5) {
                      toast.error('A listing can have up to 5 photos');
                      break;
                    } else {
                      const preview = URL.createObjectURL(file);
                      photoUrlsRef.current.add(preview);
                      accepted.push({ file, preview });
                    }
                  }
                  if (accepted.length && remaining > 0) setPhotoFiles((current) => [...current, ...accepted].slice(0, 5));
                }}
              />
              <Button type="button" variant="secondary" size="sm" disabled={photoFiles.length >= 5} onClick={() => photoInputRef.current?.click()}><ImagePlus size={15} /> Add photos</Button>
            </div>
            {photoFiles.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {photoFiles.map(({ file, preview }, index) => <div key={preview} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                  <img src={preview} alt={`${file.name} preview`} className="h-full w-full object-cover" />
                  <span className="absolute bottom-0 left-0 right-0 truncate bg-slate-950/65 px-2 py-1 text-[10px] text-white">{file.name}</span>
                  <button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => {
                    URL.revokeObjectURL(preview);
                    photoUrlsRef.current.delete(preview);
                    setPhotoFiles((current) => current.filter((item) => item.preview !== preview));
                  }} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-slate-700 shadow hover:bg-red-50 hover:text-red-700"><X size={15} /></button>
                </div>)}
              </div>
            ) : (
              <button type="button" onClick={() => photoInputRef.current?.click()} className="flex min-h-24 w-full items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-4 text-sm text-gray-500 transition hover:border-emerald-500 hover:bg-emerald-50/50">
                <ImagePlus size={20} className="text-emerald-700" /> Click to add listing photos <span className="text-xs text-gray-400">JPEG, PNG, WebP · max 5 MB each</span>
              </button>
            )}
          </div>
          <div className="mt-4">
            <label className="form-label">Description</label>
            <textarea
              className="form-input min-h-[80px] resize-y"
              placeholder="Describe your crop, growing practices, certifications..."
              {...register('description')}
            />
          </div>
        </div>}

        {/* Quantity + Price */}
        {activeStep === 1 && <div className="card p-6 workflow-panel">
          <h2 className="font-display font-semibold text-gray-900 mb-4">Quantity &amp; Pricing</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Expected Quantity *"
              type="number"
              step="0.1"
              placeholder="e.g. 500"
              error={errors.quantity?.expected?.message || errors['quantity.expected']?.message}
              {...register('quantity.expected')}
            />
            <Select label="Unit *" error={errors.quantity?.unit?.message || errors['quantity.unit']?.message} {...register('quantity.unit')}>
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </Select>
            <Input
              label="Expected Price / unit (₹) *"
              type="number"
              step="0.01"
              placeholder="e.g. 35"
              error={errors.pricePerUnit?.expected?.message || errors['pricePerUnit.expected']?.message}
              {...register('pricePerUnit.expected')}
            />
            <Input
              label="Minimum Acceptable Price (₹)"
              type="number"
              step="0.01"
              placeholder="e.g. 28"
              hint="Lowest price you'd accept"
              error={errors.pricePerUnit?.minimum?.message || errors['pricePerUnit.minimum']?.message}
              {...register('pricePerUnit.minimum')}
            />
          </div>
        </div>}

        {/* Harvest Date */}
        {activeStep === 2 && <div className="card p-6 workflow-panel">
          <h2 className="font-display font-semibold text-gray-900 mb-4">Harvest Timeline</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Expected Harvest Date *"
              type="date"
              error={errors.harvestDate?.expected?.message || errors['harvestDate.expected']?.message}
              {...register('harvestDate.expected')}
            />
          </div>
          <p className="text-xs text-gray-500 mt-3">
            💡 Pre-harvest listings give buyers time to plan. List as early as possible for better visibility.
          </p>
        </div>}

        {mutation.error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0" />
            {mutation.error.response?.data?.message || 'Something went wrong'}
          </div>
        )}

        <div className="workflow-footer">
          <Button type="button" variant="ghost" onClick={() => activeStep > 0 ? setActiveStep((step) => step - 1) : navigate('/farmer/listings')}>
            {activeStep > 0 ? 'Back' : 'Cancel'}
          </Button>
          <span className="workflow-save-note" role="status">{saveState || 'Your details are only published when you finish.'}</span>
          {activeStep < listingSteps.length - 1
            ? <Button type="button" onClick={advanceListingStep}>Continue <ArrowRight size={15} /></Button>
            : <Button type="submit" loading={isSubmitting || mutation.isPending} size="lg">Publish Listing <ExternalLink size={15} /></Button>}
        </div>
      </form>
    </div>
  );
};

export default CreateListing;
