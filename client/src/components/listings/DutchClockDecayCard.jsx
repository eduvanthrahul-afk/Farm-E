import { useState, useEffect } from 'react';
import { Clock, ShieldAlert, Sparkles } from 'lucide-react';
import { formatINR } from '@/utils/format';
import Button from '@/components/ui/Button';

export default function DutchClockDecayCard({ listing, isOwner, onActivate, onDeactivate, isUpdating }) {
  const priceDecay = listing.priceDecay;
  const isEnabled = priceDecay?.enabled;

  const [timeUntilDrop, setTimeUntilDrop] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [floorInput, setFloorInput] = useState(listing.pricePerUnit?.minimum || Math.floor(listing.pricePerUnit?.expected * 0.7));
  const [dropAmount, setDropAmount] = useState(2);
  const [intervalMins, setIntervalMins] = useState(30);

  // Countdown timer to next price drop
  useEffect(() => {
    if (!isEnabled || !priceDecay?.nextDropAt) return;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const target = new Date(priceDecay.nextDropAt).getTime();
      const distance = target - now;

      if (distance <= 0) {
        setTimeUntilDrop('Dropping now...');
        return;
      }

      const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((distance % (1000 * 60)) / 1000);
      setTimeUntilDrop(`${m}m ${s.toString().padStart(2, '0')}s`);
    }, 1000);

    return () => clearInterval(timer);
  }, [isEnabled, priceDecay?.nextDropAt, priceDecay?.isAtFloor]);

  // Only the farmer who owns this listing can start a price decay sale.
  // Buyers can still see an already active sale and its current terms below.
  if (!isEnabled && !isOwner) return null;

  if (!isEnabled) {
    return (
      <div className="card p-4 border border-orange-200 bg-gradient-to-br from-orange-50/60 to-amber-50/40 mb-4 rounded-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-orange-100 text-orange-700 font-bold text-xs flex items-center gap-1">
              <Clock size={14} /> Dutch Clock
            </span>
            <span className="text-xs font-bold text-gray-800">Price Decay Flash Sale</span>
          </div>
          <span className="text-[10px] text-orange-600 font-semibold uppercase">Zero-Waste</span>
        </div>
        <p className="text-xs text-gray-600 mb-3 leading-relaxed">
          Produce nearing shelf-life? Automatically drop price by ₹2 every 30 mins down to your floor reserve price to ensure quick sale.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs border-orange-300 text-orange-700 hover:bg-orange-100/60"
          onClick={() => setModalOpen(true)}
        >
          ⚡ Activate Dutch Price Decay
        </Button>

        {modalOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100">
              <h3 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
                <Clock size={18} className="text-orange-600" /> Start Dutch Price Decay
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Current price: <strong className="text-gray-800">{formatINR(listing.pricePerUnit?.expected)}</strong>/{listing.quantity?.unit}
              </p>

              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Floor Reserve Price (₹) *
                  </label>
                  <input
                    type="number"
                    value={floorInput}
                    onChange={(e) => setFloorInput(e.target.value)}
                    className="form-input text-xs w-full rounded-xl border-gray-300"
                    placeholder="e.g. 25"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Price will never drop below this floor</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Drop Amount (₹)</label>
                    <input
                      type="number"
                      value={dropAmount}
                      onChange={(e) => setDropAmount(e.target.value)}
                      className="form-input text-xs w-full rounded-xl border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Interval (Mins)</label>
                    <input
                      type="number"
                      value={intervalMins}
                      onChange={(e) => setIntervalMins(e.target.value)}
                      className="form-input text-xs w-full rounded-xl border-gray-300"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  className="w-full text-xs bg-orange-600 hover:bg-orange-700 text-white"
                  loading={isUpdating}
                  onClick={() => {
                    onActivate({
                      floorPrice: Number(floorInput),
                      decrementAmount: Number(dropAmount),
                      intervalMinutes: Number(intervalMins),
                    });
                    setModalOpen(false);
                  }}
                >
                  Confirm & Launch
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active Decay State Banner
  return (
    <div className="card p-4 border-2 border-orange-400 bg-gradient-to-br from-orange-500/10 via-amber-500/15 to-red-500/5 mb-4 rounded-3xl relative overflow-hidden shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-ping" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-orange-800">
            ⚡ LIVE DUTCH PRICE DECAY
          </span>
        </div>
        <span className="text-[11px] font-bold text-red-600 bg-red-100/80 px-2.5 py-0.5 rounded-full">
          Perishable Flash Sale
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 my-3 bg-white/90 p-3 rounded-2xl border border-orange-200">
        <div>
          <p className="text-[10px] uppercase font-bold text-gray-400">Next Price Drop In</p>
          <p className="text-base font-mono font-extrabold text-orange-600 flex items-center gap-1 mt-0.5">
            <Clock size={15} /> {priceDecay.isAtFloor ? 'Floor reached' : timeUntilDrop || '30m 00s'}
          </p>
          {!priceDecay.isAtFloor && (
            <p className="text-[10px] text-gray-500 mt-0.5">
              Dropping by -{formatINR(priceDecay.decrementAmount || 2)}
            </p>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase font-bold text-gray-400">Guaranteed Floor</p>
          <p className="text-base font-bold text-gray-800 mt-0.5">
            {formatINR(priceDecay.floorPrice)}/{listing.quantity?.unit}
          </p>
          <p className="text-[10px] text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
            <ShieldAlert size={12} /> Protected Minimum
          </p>
        </div>
      </div>

      <p className="text-[11px] text-orange-950 font-medium mb-3 flex items-center gap-1.5">
        <Sparkles size={14} className="text-orange-500 shrink-0" />
        <span>Price drops automatically until a buyer purchases! First come, first served.</span>
      </p>

      {isOwner && (
        <Button
          size="sm"
          variant="secondary"
          className="w-full text-xs border-orange-200 text-orange-800 hover:bg-orange-100"
          loading={isUpdating}
          onClick={onDeactivate}
        >
          Stop Price Decay
        </Button>
      )}
    </div>
  );
}
