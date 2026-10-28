import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, ImagePlus, Paperclip, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { ordersApi } from '@/api/index';
import Button from '@/components/ui/Button';
import { formatDate } from '@/utils/format';

const categoryLabels = {
  DELIVERY_PHOTO: 'Delivery photo',
  WEIGHT_RECORD: 'Weight record',
  OTHER: 'Other evidence',
};

export default function OrderEvidencePanel({ orderId, evidence = [], allowUpload = false }) {
  const qc = useQueryClient();
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [category, setCategory] = useState('DELIVERY_PHOTO');
  const [description, setDescription] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  const uploadMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      formData.append('category', category);
      formData.append('description', description.trim());
      return ordersApi.uploadEvidence(orderId, formData);
    },
    onSuccess: () => {
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setDescription('');
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['dispute'] });
      toast.success('Evidence added to the order');
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not upload evidence'),
  });

  const downloadEvidence = async (item) => {
    setDownloadingId(item._id);
    try {
      const response = await ordersApi.downloadEvidence(orderId, item._id);
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.originalName || 'order-evidence';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not download this file');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <section className="card p-5" aria-labelledby={`order-evidence-${orderId}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 id={`order-evidence-${orderId}`} className="font-display font-semibold text-gray-900 flex items-center gap-2">
            <Paperclip size={17} className="text-primary-600" /> Order evidence
          </h2>
          <p className="text-xs text-gray-500 mt-1">Both order participants can add, view, and download evidence.</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{evidence.length}</span>
      </div>

      {evidence.length ? (
        <ul className="divide-y divide-gray-100">
          {evidence.map((item) => {
            const isImage = item.mimeType?.startsWith('image/');
            const Icon = isImage ? ImagePlus : FileText;
            return (
              <li key={item._id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700"><Icon size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800">{item.originalName}</p>
                  <p className="text-xs text-gray-500">
                    {categoryLabels[item.category] || 'Evidence'} · {item.addedBy?.name || 'Order participant'} · {formatDate(item.createdAt)}
                  </p>
                  {item.description && <p className="mt-0.5 text-xs text-gray-600">{item.description}</p>}
                </div>
                <Button type="button" size="sm" variant="ghost" loading={downloadingId === item._id} aria-label={`Download ${item.originalName}`} onClick={() => downloadEvidence(item)}>
                  <Download size={15} /><span className="hidden sm:inline">Download</span>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">No delivery or weight evidence has been added yet.</p>}

      {allowUpload && (
        <form className="mt-4 space-y-3 border-t border-gray-100 pt-4" onSubmit={(event) => { event.preventDefault(); uploadMutation.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <label className="block">
              <span className="form-label">Evidence type</span>
              <select className="form-select" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="DELIVERY_PHOTO">Delivery photo</option>
                <option value="WEIGHT_RECORD">Weight record</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="block">
              <span className="form-label">Photos or PDF (max 5 files, 5 MB each)</span>
              <input ref={fileInputRef} className="form-input text-sm" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 5))} />
            </label>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input className="form-input flex-1" maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional note, e.g. scale reading at delivery" />
            <Button type="submit" size="sm" loading={uploadMutation.isPending} disabled={!files.length}><Upload size={15} /> Add evidence</Button>
          </div>
          {files.length > 0 && <p className="text-xs text-gray-500" aria-live="polite">Selected: {files.map((file) => file.name).join(', ')}</p>}
        </form>
      )}
    </section>
  );
}
