import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/auth/useAuth';
import { bidsApi } from '@/api/index';
import { formatINR } from '@/utils/format';
import { Flame, Clock, TrendingDown, ShieldAlert, Award, ArrowDown, Send, ChevronDown, ChevronUp, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import toast from 'react-hot-toast';

export default function LiveAuctionArena({ requirement }) {
  const { user } = useAuth();
  const { socket, emit, on } = useSocket();

  const [currentLowest, setCurrentLowest] = useState(
    requirement.currentLowestBid?.pricePerUnit || requirement.priceTarget?.max || 0
  );
  const [lowestFarmer, setLowestFarmer] = useState(
    requirement.currentLowestBid?.farmer?.name || 'Opening Price'
  );
  const [bidsCount, setBidsCount] = useState(requirement.bidsCount || 0);
  const [bidList, setBidList] = useState([]);
  const [customBid, setCustomBid] = useState('');
  const [timeLeft, setTimeLeft] = useState('');
  const [isEnded, setIsEnded] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [harvestDate, setHarvestDate] = useState(() => new Date().toISOString().slice(0, 10));

  const reserveFloor = requirement.reserveFloorPrice || 0;
  const isFarmer = user?.role === 'FARMER';

  // Countdown timer calculation
  useEffect(() => {
    if (!requirement.auctionEndsAt) return;

    const timer = setInterval(() => {
      const distance = new Date(requirement.auctionEndsAt) - new Date();
      if (distance <= 0) {
        clearInterval(timer);
        setTimeLeft('Auction Closed');
        setIsEnded(true);
        return;
      }
      const hours = Math.floor((distance / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((distance / 1000 / 60) % 60);
      const seconds = Math.floor((distance / 1000) % 60);
      setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [requirement.auctionEndsAt]);

  // Socket room joining and listeners
  useEffect(() => {
    if (!socket || !requirement._id) return;

    const handleNewBid = (bid) => {
      setCurrentLowest(bid.pricePerUnit);
      setLowestFarmer(bid.farmerName);
      setBidsCount((prev) => prev + 1);
      setBidList((prev) => [bid, ...prev.slice(0, 9)]);
      toast.success(`⚡ New lowest bid: ₹${bid.pricePerUnit}/unit by ${bid.farmerName}!`);
    };

    const handleAuctionError = ({ message }) => {
      toast.error(message || 'Could not place auction bid');
    };
    const joinAuction = () => emit('auction:join', { requirementId: requirement._id });

    const unsubNewBid = on('auction:new_bid', handleNewBid);
    const unsubError = on('auction:error', handleAuctionError);
    const unsubConnect = on('connect', joinAuction);
    if (socket.connected) joinAuction();

    return () => {
      emit('auction:leave', { requirementId: requirement._id });
      if (unsubNewBid) unsubNewBid();
      if (unsubError) unsubError();
      if (unsubConnect) unsubConnect();
    };
  }, [socket, requirement._id, emit, on]);

  const handlePlaceBid = (priceToBid) => {
    const price = Number(priceToBid);
    if (!price || isNaN(price)) return toast.error('Enter a valid bid price');
    if (reserveFloor > 0 && price < reserveFloor) {
      return toast.error(`Cannot bid below Reserve Floor Price of ₹${reserveFloor}`);
    }
    if (currentLowest && price >= currentLowest) {
      return toast.error(`Your bid must be lower than the current lowest ₹${currentLowest}`);
    }

    setIsSubmitting(true);
    bidsApi.submit({
      requirement: requirement._id,
      price: { perUnit: price },
      quantity: { offered: requirement.quantity?.required, unit: requirement.quantity?.unit },
      harvestDate,
    }).then(() => {
      setCustomBid('');
      toast.success('Your bid was submitted');
    }).catch((error) => {
      toast.error(error.response?.data?.message || 'Could not place auction bid');
    }).finally(() => setIsSubmitting(false));
  };

  return (
    <section className={`live-auction-panel ${isExpanded ? 'is-expanded' : ''}`} aria-label="Live reverse auction">
      <div className="live-auction-summary">
        <div className="live-auction-identity">
          <span className="live-auction-symbol"><Flame size={18} /></span>
          <div className="live-auction-title">
            <div><span className="live-auction-live"><i /> LIVE AUCTION</span><span className="live-auction-type">{requirement.auctionType === 'REVERSE_DUTCH' ? 'Dutch descending' : 'English reverse'}</span></div>
            <h3>{requirement.crop?.name || 'Buyer'} price room</h3>
            <p><Award size={12} /> {lowestFarmer} leads <span>·</span> {bidsCount} {bidsCount === 1 ? 'offer' : 'offers'}</p>
          </div>
        </div>

        <div className="live-auction-leading-bid"><small>LOWEST OFFER</small><strong>{formatINR(currentLowest)}<em>/{requirement.quantity?.unit}</em></strong></div>
        <div className="live-auction-clock"><Clock size={15} /><span><small>TIME LEFT</small><b>{timeLeft || (requirement.auctionEndsAt ? 'Starting…' : 'No timer')}</b></span></div>
        <button className="live-auction-toggle" type="button" aria-expanded={isExpanded} onClick={() => setIsExpanded((expanded) => !expanded)}>
          {isExpanded ? 'Hide details' : isFarmer && !isEnded ? 'Open bidding' : 'Auction details'} {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {isExpanded && <div className="live-auction-expanded">
        <div className="live-auction-metrics">
          <div><ShieldAlert size={15} /><span><small>RESERVE FLOOR</small><b>{reserveFloor > 0 ? `${formatINR(reserveFloor)}/${requirement.quantity?.unit}` : 'Not set'}</b></span></div>
          <div><Users size={15} /><span><small>OFFERS PLACED</small><b>{bidsCount}</b></span></div>
          <div><TrendingDown size={15} /><span><small>LEADING FARMER</small><b>{lowestFarmer}</b></span></div>
        </div>

        {isFarmer && !isEnded && <div className="live-auction-bid-tools">
          <div className="live-auction-bid-heading"><div><span>PLACE YOUR OFFER</span><p>Choose a quick drop or enter your own price.</p></div><span className="live-auction-current-label">Current {formatINR(currentLowest)}/{requirement.quantity?.unit}</span></div>
          <div className="live-auction-quick-drops">
            {[0.5, 1, 2].map((drop) => <Button key={drop} type="button" size="sm" variant="outline" className="live-auction-drop" disabled={isSubmitting} onClick={() => handlePlaceBid(currentLowest - drop)}><ArrowDown size={13} /> ₹{drop.toFixed(2)} <span>{formatINR(currentLowest - drop)}</span></Button>)}
          </div>
          <div className="live-auction-custom-bid">
            <label><span>Harvest date</span><input aria-label="Expected harvest date" type="date" value={harvestDate} onChange={(event) => setHarvestDate(event.target.value)} className="form-input" /></label>
            <label><span>Your price / {requirement.quantity?.unit}</span><input aria-label="Your bid price" type="number" step="0.1" placeholder={`Under ${currentLowest}`} value={customBid} onChange={(event) => setCustomBid(event.target.value)} className="form-input" /></label>
            <Button type="button" size="sm" variant="amber" loading={isSubmitting} disabled={isSubmitting || !harvestDate} onClick={() => handlePlaceBid(customBid)}><Send size={13} /> Place offer</Button>
          </div>
        </div>}

        {bidList.length > 0 && <div className="live-auction-ticker"><p>LIVE OFFER TICKER</p>{bidList.map((bid, index) => <div key={`${bid.placedAt}-${index}`}><span><b>{bid.farmerName}</b><small>{new Date(bid.placedAt).toLocaleTimeString()}</small></span><strong>{formatINR(bid.pricePerUnit)} / unit</strong></div>)}</div>}
      </div>}
    </section>
  );
}
