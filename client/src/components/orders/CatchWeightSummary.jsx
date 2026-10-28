import { Scale, TrendingUp, TrendingDown } from 'lucide-react';
import { formatINR, formatQty } from '@/utils/format';

const CatchWeightSummary = ({ order }) => {
  const { quantity, price } = order;

  if (!quantity.weightVerified) {
    return (
      <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
        <div className="flex items-center gap-2 mb-2">
          <Scale size={16} className="text-amber-600" />
          <span className="text-sm font-semibold text-amber-700">Catch-Weight Pricing</span>
        </div>
        <p className="text-xs text-amber-600">
          Final amount will be calculated after actual weight verification upon delivery.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-500">Expected Qty</p>
            <p className="font-semibold">{formatQty(quantity.expected, quantity.unit)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Est. Amount</p>
            <p className="font-semibold text-primary-700">{formatINR(price.expectedTotal)}</p>
          </div>
        </div>
      </div>
    );
  }

  const diff = quantity.actual - quantity.expected;
  const diffPct = ((diff / quantity.expected) * 100).toFixed(1);
  const isOver = diff > 0;

  return (
    <div className="p-4 bg-primary-50 rounded-xl border border-primary-200">
      <div className="flex items-center gap-2 mb-3">
        <Scale size={16} className="text-primary-600" />
        <span className="text-sm font-semibold text-primary-700">Catch-Weight Verified ✓</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        <div>
          <p className="text-xs text-gray-500">Expected Qty</p>
          <p className="font-medium text-gray-700">{formatQty(quantity.expected, quantity.unit)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Actual Qty</p>
          <p className="font-semibold text-gray-900">{formatQty(quantity.actual, quantity.unit)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Price/Unit</p>
          <p className="font-medium">{formatINR(price.perUnit)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Difference</p>
          <p className={`font-medium flex items-center gap-1 ${isOver ? 'text-primary-600' : 'text-red-600'}`}>
            {isOver ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isOver ? '+' : ''}{diff.toFixed(2)} {quantity.unit} ({diffPct}%)
          </p>
        </div>
      </div>

      {/* Final amount */}
      <div className="p-3 bg-white rounded-lg border border-primary-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Final Amount</p>
            <p className="text-xs text-gray-400">
              {formatQty(quantity.actual, quantity.unit)} × {formatINR(price.perUnit)}
            </p>
          </div>
          <p className="text-xl font-display font-bold text-primary-700">
            {formatINR(price.actualTotal)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default CatchWeightSummary;
