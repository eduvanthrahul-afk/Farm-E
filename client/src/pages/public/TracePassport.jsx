import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '@/config/axios';
import {
  MapPin,
  ShieldCheck,
  ShieldAlert,
  CircleHelp,
  Sparkles,
  Sprout,
  Calendar,
  ArrowLeft,
  Building2,
  Award
} from 'lucide-react';
import { PageSpinner } from '@/components/ui/Spinner';

export default function TracePassport() {
  const { batchNumber } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    async function fetchTrace() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get(`/orders/trace/${batchNumber}`);
        if (active) setData(res.data.data.trace);
      } catch (err) {
        if (active) setError(err.response?.data?.message || 'Could not find batch traceability information.');
      } finally {
        if (active) setLoading(false);
      }
    }
    if (batchNumber) fetchTrace();
    return () => { active = false; };
  }, [batchNumber]);

  if (loading) return <PageSpinner />;

  if (error || !data) {
    return (
      <div className="min-h-screen bg-emerald-50/40 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl text-center border border-emerald-100">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">QR Code Not Recognized</h2>
          <p className="text-gray-500 text-sm mb-6">{error || 'This code does not match a Farm-E batch record.'}</p>
          <Link to="/" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft size={16} /> Return to Farm-E
          </Link>
        </div>
      </div>
    );
  }

  const { crop, farm, farmerName, verifiedWeight, issuedAt, harvestDate, recordFingerprint } = data;
  const listedCertifications = farm?.listedCertifications?.length
    ? farm.listedCertifications
    : farm?.certifications || [];
  const isVerified = data.verificationStatus === 'verified';
  const isInvalid = data.verificationStatus === 'invalid';
  const verificationBox = isVerified
    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
    : isInvalid
      ? 'bg-red-50 border-red-200 text-red-900'
      : 'bg-amber-50 border-amber-200 text-amber-900';

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/80 via-white to-gray-50 text-gray-800 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <section className={`rounded-2xl border p-5 mb-6 ${verificationBox}`} role="status">
          <div className="flex items-start gap-3">
            {isVerified
              ? <ShieldCheck size={22} className="shrink-0 mt-0.5" />
              : isInvalid
                ? <ShieldAlert size={22} className="shrink-0 mt-0.5" />
                : <CircleHelp size={22} className="shrink-0 mt-0.5" />}
            <div>
              <h2 className="font-bold">
                {isVerified ? 'Farm-E signature verified' : isInvalid ? 'Could not verify this batch record' : 'Older batch record — no signature'}
              </h2>
              <p className="text-sm mt-1">
                {isVerified
                  ? 'The signed batch snapshot matches a record issued by Farm-E and has not been altered since it was signed.'
                  : isInvalid
                    ? 'The saved batch snapshot does not match its Farm-E signature. Do not rely on the details below.'
                    : 'This record predates signed QR checks, so Farm-E cannot confirm that its details have remained unchanged.'}
              </p>
              <p className="text-xs mt-2 opacity-80">
                A valid signature confirms the Farm-E record only. It does not prove the physical produce is genuine or validate listed certificates; a QR code can also be copied. Current order status and delivery weight are live updates outside the signed snapshot.
              </p>
            </div>
          </div>
        </section>

        {/* Top Header Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-emerald-100/80 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-6 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                <Sprout size={24} />
              </div>
              <div>
                <span className="text-xs uppercase tracking-wider font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  Farm-E Batch Record
                </span>
                <h1 className="text-2xl font-extrabold text-gray-900 mt-1">Produce Traceability Passport</h1>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 font-mono">BATCH CODE</p>
              <p className="text-sm font-mono font-bold text-emerald-800 bg-emerald-50/60 px-3 py-1 rounded-lg border border-emerald-100">
                {data.batchNumber}
              </p>
            </div>
          </div>

          {/* Product Banner */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100">
            <div>
              <p className="text-xs text-gray-500 font-medium">Crop & Variety</p>
              <p className="text-lg font-bold text-gray-900">{crop?.name}</p>
              <p className="text-xs text-emerald-700">{crop?.variety || 'Variety not specified'}{crop?.grade ? ` · Grade ${crop.grade}` : ''}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Batch Quantity · Signed</p>
              <p className="text-lg font-bold text-gray-900">{data.quantity?.expected} {data.quantity?.unit}</p>
              <p className="text-xs text-gray-500">Recorded when Farm-E issued this batch snapshot</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Delivery Weight · Live</p>
              <p className="text-lg font-bold text-gray-900">
                {verifiedWeight == null ? 'Pending weigh-in' : `${verifiedWeight} ${data.quantity?.unit}`}
              </p>
              <p className="text-xs text-gray-500">{verifiedWeight == null ? 'Final weight has not been confirmed' : 'Recorded at delivery'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Order Status · Live</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-sm font-bold text-emerald-800 uppercase">{data.status?.replaceAll('_', ' ')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Origin & Cultivation Timeline */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Farm Origin */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-100/80">
            <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Building2 size={18} className="text-emerald-600" /> Farm of Origin
            </h2>
            <div className="space-y-3.5 text-sm">
              <div>
                <p className="text-xs text-gray-400">Farm Name</p>
                <p className="font-semibold text-gray-900">{farm?.name || 'Partner Agri Farm'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Grower / Farmer</p>
                <p className="font-semibold text-gray-800">{farmerName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Farm-E Farm Review</p>
                <p className="font-semibold text-gray-800">
                  {farm?.farmReview === 'verified' ? 'Farm review completed' : 'Not verified by Farm-E'}
                </p>
              </div>
              <div className="flex items-start gap-2 pt-1 text-gray-600">
                <MapPin size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <span className="text-xs leading-relaxed">
                  {farm?.location?.address || farm?.location?.district || 'Registered agricultural cluster'}
                </span>
              </div>
            </div>
          </div>

          {/* Standards & Certifications */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-100/80">
            <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Award size={18} className="text-emerald-600" /> Quality & Assurance
            </h2>
            <div className="space-y-3.5 text-sm">
              <div>
                <p className="text-xs text-gray-400">Certifications Listed by Farm</p>
                {listedCertifications.length ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {listedCertifications.map((certification) => (
                      <span key={certification} className="bg-gray-50 text-gray-700 text-xs font-semibold px-2.5 py-1 rounded-md border border-gray-200">
                        {certification}
                      </span>
                    ))}
                  </div>
                ) : <p className="font-semibold text-gray-800 mt-1">None listed</p>}
                <p className="text-xs text-gray-500 mt-1">A listing is not proof that a certificate was independently checked.</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Harvest Date Reported</p>
                <p className="font-semibold text-gray-800 flex items-center gap-1.5 mt-0.5">
                  <Calendar size={14} className="text-emerald-600" />
                  {harvestDate ? new Date(harvestDate).toLocaleDateString() : 'Not recorded'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Passport Issued</p>
                <p className="font-semibold text-gray-800">
                  {issuedAt ? new Date(issuedAt).toLocaleDateString() : 'Not recorded'}
                </p>
              </div>
              <div className="pt-2">
                <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200/60">
                  <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                  <span>Harvest and packing dates come from the batch record. Check the signature status above.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Farm-E record fingerprint */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-100/80 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Sparkles size={16} className="text-emerald-600" /> Signed Snapshot Fingerprint
            </h3>
            <span className="text-xs text-gray-500 font-medium">Farm-E record</span>
          </div>
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 font-mono text-xs text-gray-600 break-all select-all">
            {recordFingerprint || 'No signed snapshot fingerprint is available for this batch.'}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            SHA-256 reference for the issued batch snapshot. The signature status above is checked by Farm-E; this fingerprint alone does not authenticate a product.
          </p>
        </div>

        {/* Back Link */}
        <div className="text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-100/70 hover:bg-emerald-100 px-5 py-2.5 rounded-full transition-colors"
          >
            <ArrowLeft size={16} /> Explore Farm-E Platform
          </Link>
        </div>
      </div>
    </div>
  );
}
