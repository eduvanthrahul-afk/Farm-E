import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, AlertCircle, ArrowRight } from 'lucide-react';
import { requirementsApi } from '@/api/index';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
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
    required: z.preprocess(
      (v) => (v === '' || v === undefined ? undefined : Number(v)),
      z.number({ error: 'Quantity is required' }).positive('Quantity must be greater than 0')
    ),
    unit: z.string().min(1, 'Unit is required'),
    flexibility: z.enum(['EXACT', '±10%', '±20%', 'FLEXIBLE']).default('±10%'),
  }),
  priceTarget: z.object({
    max: z.preprocess(
      (v) => (v === '' || v === undefined ? undefined : Number(v)),
      z.number({ error: 'Max price is required' }).positive('Max price must be greater than 0')
    ),
    preferred: z.preprocess(
      (v) => (v === '' || v === undefined ? undefined : Number(v)),
      z.number().positive('Preferred price must be greater than 0').optional()
    ),
  }),
  quality: z.object({
    grade: z.string().optional(),
    certifications: z.array(z.string()).optional(),
  }),
  deliveryDate: z.object({
    required: z.string().min(1, 'Delivery date is required'),
    flexible: z.boolean().optional(),
  }),
  deliveryLocation: z.object({
    address: z.string().trim().min(1, 'Delivery address is required'),
    district: z.string().trim().optional(),
    state: z.string().trim().optional(),
  }),
  expiresAt: z.string().min(1, 'Expiry date is required'),
  description: z.string().trim().optional(),
  isPublic: z.boolean().optional(),
  isLiveAuction: z.boolean().optional(),
  reserveFloorPrice: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : Number(v)),
    z.number().positive('Reserve floor must be greater than 0').optional()
  ),
  auctionDurationHours: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : Number(v)),
    z.number().min(0.25).max(24).optional()
  ),
}).superRefine((data, ctx) => {
  if (data.priceTarget.preferred && data.priceTarget.preferred > data.priceTarget.max) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['priceTarget', 'preferred'], message: 'Preferred price cannot exceed max price' });
  }
  if (data.isLiveAuction) {
    if (!data.reserveFloorPrice) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reserveFloorPrice'], message: 'Set a reserve floor for a live auction' });
    else if (data.reserveFloorPrice + 1 > data.priceTarget.max) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reserveFloorPrice'], message: 'Leave at least ₹1 between the max price and reserve floor' });
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const delivery = new Date(`${data.deliveryDate.required}T00:00:00`);
  const expiry = new Date(`${data.expiresAt}T23:59:59`);
  if (delivery < today) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveryDate', 'required'], message: 'Delivery date must be today or later' });
  if (expiry <= new Date()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'Expiry must be in the future' });
  if (!data.isLiveAuction && expiry >= delivery) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'Requirement should expire before the delivery date' });
});

const getDefaultDates = () => {
  const d1 = new Date();
  d1.setDate(d1.getDate() + 14);
  const d2 = new Date();
  d2.setDate(d2.getDate() + 7);
  return {
    deliveryDate: d1.toISOString().split('T')[0],
    expiresAt: d2.toISOString().split('T')[0],
  };
};

const CreateRequirement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const dates = getDefaultDates();
  const [activeStep, setActiveStep] = useState(0);
  const [deliveryCoordinates, setDeliveryCoordinates] = useState(null);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      crop: { category: 'Vegetables' },
      quantity: { unit: 'kg', flexibility: '±10%' },
      quality: { certifications: [] },
      deliveryDate: { required: dates.deliveryDate, flexible: false },
      expiresAt: dates.expiresAt,
      isPublic: true,
    },
  });
  const { register, handleSubmit, trigger, setValue, formState: { errors, isSubmitting } } = form;
  const { saveState, clearDraft } = useFormDraft(form, `requirement:${user?._id || 'unknown'}`);

  const requirementSteps = [
    { title: 'Crop details', description: 'What do you need?', fields: ['crop.name', 'crop.category'] },
    { title: 'Quantity & budget', description: 'Define your target', fields: ['quantity.required', 'quantity.unit', 'quantity.flexibility', 'priceTarget.max', 'priceTarget.preferred', 'isLiveAuction', 'reserveFloorPrice', 'auctionDurationHours'] },
    { title: 'Delivery & post', description: 'Where and when?', fields: ['deliveryDate.required', 'deliveryDate.flexible', 'expiresAt', 'deliveryLocation.address'] },
  ];
  const advanceRequirementStep = async () => {
    const current = requirementSteps[activeStep];
    if (await trigger(current.fields)) setActiveStep((step) => Math.min(step + 1, requirementSteps.length - 1));
  };

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        crop: {
          name: data.crop?.name,
          variety: data.crop?.variety || undefined,
          category: data.crop?.category,
        },
        quantity: {
          required: Number(data.quantity?.required),
          unit: data.quantity?.unit,
          flexibility: data.quantity?.flexibility || '±10%',
        },
        priceTarget: {
          max: Number(data.priceTarget?.max),
          preferred: data.priceTarget?.preferred !== undefined ? Number(data.priceTarget?.preferred) : undefined,
        },
        quality: {
          grade: data.quality?.grade || undefined,
          certifications: data.quality?.certifications || [],
        },
        deliveryDate: { required: data.deliveryDate?.required, flexible: data.deliveryDate?.flexible === true },
        deliveryLocation: {
          address: data.deliveryLocation?.address,
          district: data.deliveryLocation?.district || undefined,
          state: data.deliveryLocation?.state || undefined,
          ...(deliveryCoordinates ? { coordinates: { type: 'Point', coordinates: deliveryCoordinates } } : {}),
        },
        expiresAt: data.expiresAt,
        description: data.description || undefined,
        isPublic: data.isPublic !== false,
        isLiveAuction: data.isLiveAuction === true,
        ...(data.isLiveAuction ? {
          reserveFloorPrice: Number(data.reserveFloorPrice),
          auctionDurationHours: Number(data.auctionDurationHours || 2),
        } : {}),
      };
      return requirementsApi.create(payload);
    },
    onSuccess: (response) => {
      clearDraft();
      qc.invalidateQueries({ queryKey: ['requirements', 'mine'] });
      const requirementId = response.data.data.requirement?._id;
      toast.success('Requirement posted! Reviewing matching listings.');
      navigate(requirementId ? `/requirements/${requirementId}` : '/buyer/requirements');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to post requirement'),
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

  return (
    <div className="page-sm animate-fade-in">
      <div className="mb-6">
        <span className="page-kicker">BUYER WORKSPACE / PROCUREMENT</span>
        <h1 className="section-title mt-1">Create a buying request</h1>
        <p className="text-sm text-gray-500 mt-1">Tell farmers what you need and compare offers in one place.</p>
      </div>

      <div className="workflow-steps" aria-label="Requirement steps">
        {requirementSteps.map((item, index) => <div key={item.title} className={`workflow-step ${index === activeStep ? 'is-current' : index < activeStep ? 'is-complete' : ''}`}>
          <span className="workflow-step-number">{index < activeStep ? '✓' : `0${index + 1}`}</span>
          <span className="workflow-step-copy"><b>{item.title}</b><small>{item.description}</small></span>
          {index < requirementSteps.length - 1 && <span className="workflow-step-line" />}
        </div>)}
      </div>

      <form onSubmit={handleSubmit((data) => mutation.mutate(data), onInvalid)} className="space-y-6">
        {/* Crop details */}
        {activeStep === 0 && <div className="card p-6 workflow-panel">
          <h2 className="font-display font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ClipboardList size={18} className="text-amber-600" /> Crop Requirement
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Crop Name *"
              placeholder="e.g. Onion"
              error={errors.crop?.name?.message || errors['crop.name']?.message}
              {...register('crop.name')}
            />
            <Input
              label="Variety (optional)"
              placeholder="e.g. Red Nashik"
              {...register('crop.variety')}
            />
            <Select
              label="Category *"
              error={errors.crop?.category?.message || errors['crop.category']?.message}
              {...register('crop.category')}
            >
              {CROP_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Select
              label="Preferred Grade"
              {...register('quality.grade')}
            >
              <option value="">Any grade</option>
              {QUALITY_GRADES.map((g) => <option key={g}>{g}</option>)}
            </Select>
          </div>
          <div className="mt-4">
            <span className="form-label">Required certifications</span>
            <div className="mt-1 flex flex-wrap gap-4">
              {QUALITY_CERTIFICATIONS.map((certification) => <label key={certification} className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" value={certification} className="rounded text-primary-600" {...register('quality.certifications')} />
                {certification}
              </label>)}
            </div>
          </div>
          <div className="mt-4">
            <label className="form-label">Description / Special Requirements</label>
            <textarea
              className="form-input min-h-[80px] resize-y"
              placeholder="Any specific requirements, certifications, packaging needs..."
              {...register('description')}
            />
          </div>
        </div>}

        {/* Quantity & price */}
        {activeStep === 1 && <div className="card p-6 workflow-panel">
          <h2 className="font-display font-semibold text-gray-900 mb-4">Quantity &amp; Budget</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Quantity Required *"
              type="number"
              step="0.1"
              placeholder="e.g. 2000"
              error={errors.quantity?.required?.message || errors['quantity.required']?.message}
              {...register('quantity.required')}
            />
            <Select
              label="Unit *"
              error={errors.quantity?.unit?.message || errors['quantity.unit']?.message}
              {...register('quantity.unit')}
            >
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </Select>
            <Select label="Quantity flexibility" {...register('quantity.flexibility')}>
              <option value="EXACT">Exact quantity</option>
              <option value="±10%">Allow up to 10% less</option>
              <option value="±20%">Allow up to 20% less</option>
              <option value="FLEXIBLE">Flexible; partial quantities considered</option>
            </Select>
            <Input
              label="Max Price / unit (₹) *"
              type="number"
              step="0.01"
              placeholder="e.g. 40"
              hint="Farmers will bid at or below this price"
              error={errors.priceTarget?.max?.message || errors['priceTarget.max']?.message}
              {...register('priceTarget.max')}
            />
            <Input
              label="Preferred Price / unit (₹)"
              type="number"
              step="0.01"
              placeholder="e.g. 32"
              hint="Your ideal target price"
              {...register('priceTarget.preferred')}
            />
          </div>

          {/* Dynamic Auction Toggle Box */}
          <div className="mt-5 p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                {...register('isLiveAuction')}
              />
              <div>
                <span className="font-semibold text-sm text-gray-900">
                  ⚡ Launch as Urgent Live Reverse Auction
                </span>
                <p className="text-xs text-gray-500">
                  Farmers compete in real-time by bidding downwards before the countdown expires.
                </p>
              </div>
            </label>

            <div className="grid sm:grid-cols-2 gap-4 mt-3 pt-3 border-t border-amber-200/60">
              <Input
                label="Reserve Minimum Floor Price (₹)"
                type="number"
                step="0.01"
                placeholder="e.g. 25"
                hint="Farmers cannot bid below this floor; leave at least ₹1 below your max price"
                {...register('reserveFloorPrice')}
              />
              <Input
                label="Live Auction Duration (Hours)"
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                defaultValue="2"
                hint="Choose 15 minutes to 24 hours"
                {...register('auctionDurationHours')}
              />
            </div>
          </div>
        </div>}

        {/* Delivery */}
        {activeStep === 2 && <div className="card p-6 workflow-panel">
          <h2 className="font-display font-semibold text-gray-900 mb-4">Delivery Details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Required Delivery Date *"
              type="date"
              error={errors.deliveryDate?.required?.message || errors['deliveryDate.required']?.message}
              {...register('deliveryDate.required')}
            />
            <label className="inline-flex items-center gap-2 self-end pb-3 text-sm text-gray-700">
              <input type="checkbox" className="rounded text-primary-600" {...register('deliveryDate.flexible')} />
              Delivery date is flexible
            </label>
            <Input
              label="Requirement Expires On *"
              type="date"
              error={errors.expiresAt?.message}
              hint="Bids accepted until this date"
              {...register('expiresAt')}
            />
            <Input
              label="Delivery Address *"
              placeholder="e.g. 12 Market Road, Pune"
              error={errors.deliveryLocation?.address?.message || errors['deliveryLocation.address']?.message}
              {...register('deliveryLocation.address')}
              className="sm:col-span-2"
            />
            <Input
              label="District"
              placeholder="e.g. Pune"
              {...register('deliveryLocation.district')}
            />
            <Input
              label="State"
              placeholder="e.g. Maharashtra"
              {...register('deliveryLocation.state')}
            />
            <div className="sm:col-span-2">
              <OpenStreetMapField
                value={deliveryCoordinates}
                onChange={setDeliveryCoordinates}
                onLocationResolved={(location) => {
                  [['deliveryLocation.address', location.address], ['deliveryLocation.district', location.district], ['deliveryLocation.state', location.state]]
                    .forEach(([field, value]) => { if (value) setValue(field, value, { shouldValidate: true }); });
                }}
                interactive
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded text-primary-600 border-gray-300 focus:ring-primary-500"
                defaultChecked
                {...register('isPublic')}
              />
              <span className="text-sm text-gray-700">Make this requirement publicly visible to all farmers</span>
            </label>
          </div>
        </div>}

        {mutation.error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0" />
            {mutation.error.response?.data?.message || 'Something went wrong'}
          </div>
        )}

        <div className="workflow-footer">
          <Button type="button" variant="ghost" onClick={() => activeStep > 0 ? setActiveStep((step) => step - 1) : navigate('/buyer/requirements')}>
            {activeStep > 0 ? 'Back' : 'Cancel'}
          </Button>
          <span className="workflow-save-note" role="status">{saveState || 'Review the details before posting to farmers.'}</span>
          {activeStep < requirementSteps.length - 1
            ? <Button type="button" variant="amber" onClick={advanceRequirementStep}>Continue <ArrowRight size={15} /></Button>
            : <Button type="submit" loading={isSubmitting || mutation.isPending} size="lg" variant="amber">Post Requirement <ClipboardList size={15} /></Button>}
        </div>
      </form>
    </div>
  );
};

export default CreateRequirement;
