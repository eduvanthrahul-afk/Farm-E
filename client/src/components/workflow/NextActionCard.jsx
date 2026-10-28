import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const NextActionCard = ({ title, description, href, action, icon: Icon, tone = 'farmer', showAction = true }) => (
  <section className={`next-action-card next-action-${tone}`} aria-label="Recommended next action">
    <div className="next-action-icon">{Icon ? <Icon size={21} /> : <CheckCircle2 size={21} />}</div>
    <div className="next-action-copy">
      <span className="next-action-kicker">YOUR NEXT STEP</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
    {showAction && <Link className="next-action-link" to={href}>{action}<ArrowRight size={16} /></Link>}
  </section>
);

export default NextActionCard;
