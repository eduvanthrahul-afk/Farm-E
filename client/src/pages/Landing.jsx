import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { ROLES } from '@/config/constants';
import {
  Leaf, ShieldCheck, Zap, Scale, MessageSquare,
  TrendingUp, Users, Sprout, ChevronRight,
  Wheat, Handshake, Truck, CircleCheck,
} from 'lucide-react';

const stats = [
  { label: 'Meet growers and buyers', value: 'Direct trade', icon: Users },
  { label: 'Compare price and delivery', value: 'Clear offers', icon: Scale },
  { label: 'Follow every delivery', value: 'Order tracking', icon: Handshake },
  { label: 'Keep deal chats together', value: 'Direct messages', icon: MessageSquare },
];

const features = [
  { icon: Leaf, title: 'Sell before harvest', desc: 'Share what’s growing and when it will be ready. Buyers can plan ahead and connect with you directly.', tone: 'sage' },
  { icon: Zap, title: 'Better bids, together', desc: 'Post what you need or respond to a requirement. Compare offers with clear terms before you decide.', tone: 'gold' },
  { icon: Scale, title: 'Fair by the final kilo', desc: 'Agree on a rate, then settle against the actual delivered weight. Every number stays visible.', tone: 'blue' },
  { icon: ShieldCheck, title: 'Deals with clarity', desc: 'Keep order details, milestones and agreed terms together, so both sides know what comes next.', tone: 'lavender' },
  { icon: MessageSquare, title: 'Talk it through', desc: 'Use direct messaging to ask questions, discuss terms and keep a deal moving in one place.', tone: 'mint' },
  { icon: TrendingUp, title: 'Find the right fit', desc: 'Explore produce and requirements with useful details to help you make a confident match.', tone: 'peach' },
];

const steps = [
  { icon: Sprout, title: 'Share your crop or need', copy: 'Farmers list produce. Buyers post requirements.' },
  { icon: Handshake, title: 'Agree on the details', copy: 'Compare offers and talk directly.' },
  { icon: Truck, title: 'Deliver with confidence', copy: 'Track the order through to completion.' },
];

const FieldIllustration = () => (
  <div className="field-art" aria-label="Illustration of a thriving farm landscape" role="img">
    <div className="art-sun" />
    <div className="art-cloud cloud-one" /><div className="art-cloud cloud-two" />
    <svg className="art-landscape" viewBox="0 0 680 490" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M0 205C104 176 144 130 255 164C355 195 401 97 500 119C579 137 620 163 680 145V490H0V205Z" fill="#d3e1da" />
      <path d="M0 247C114 207 199 205 281 222C402 247 461 176 548 189C610 198 643 224 680 217V490H0V247Z" fill="#9cb8ad" />
      <path d="M0 289C111 253 197 266 294 280C396 296 478 229 566 241C614 248 648 268 680 263V490H0V289Z" fill="#587a5b" />
      <path d="M0 338C107 301 195 307 293 322C390 337 470 282 565 290C610 293 650 314 680 309V490H0V338Z" fill="#183a38" />
      <path d="M-18 480C95 396 184 361 272 344C345 329 410 348 461 383C512 419 552 448 696 462V500H-18V480Z" fill="#c9a44b" />
      <path d="M14 490C119 410 204 377 279 361M110 495C195 423 268 390 329 374M222 495C288 434 350 405 402 393M344 496C391 451 441 429 484 420" stroke="#e7efec" strokeWidth="5" strokeLinecap="round" opacity=".76" />
      <path d="M514 339V262M494 287C475 256 481 230 503 226C523 244 521 268 514 277M516 307C538 275 558 270 570 284C566 307 545 318 516 318" stroke="#183a38" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M514 264C488 229 493 207 512 201C532 214 531 239 514 264ZM519 287C543 247 567 247 576 261C574 284 548 297 519 299Z" fill="#587a5b" />
      <path d="M136 340V302M122 316C108 296 112 278 128 275C144 288 141 305 136 312M138 328C155 307 170 306 178 317C174 333 157 340 138 340Z" stroke="#183a38" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M136 303C119 280 122 265 136 260C151 270 149 286 136 303ZM139 318C156 291 172 292 179 302C177 318 159 327 139 328Z" fill="#9cb8ad" />
      <path d="M369 344V305M356 318C344 300 348 283 362 281C377 293 374 307 369 315M371 333C387 314 401 314 408 324C405 338 390 346 371 346Z" stroke="#183a38" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M369 306C353 285 356 270 369 266C383 276 382 290 369 306ZM372 320C388 295 403 296 409 305C407 320 390 329 372 330Z" fill="#9cb8ad" />
      <path d="M74 187c7-8 17-8 23 0M89 182c6-9 16-10 22-2M552 170c7-8 17-8 23 0M568 165c6-9 16-10 22-2" stroke="#647572" strokeWidth="3" strokeLinecap="round" opacity=".65" />
    </svg>
    <div className="art-note note-harvest"><span className="note-icon"><Wheat size={16} /></span><span><b>Closer to the source</b><small>Trade directly with growers</small></span><CircleCheck size={17} className="note-check" /></div>
  </div>
);

const Landing = () => {
  const { user } = useAuth();
  const dashboardHref = user?.role === ROLES.FARMER ? '/farmer/dashboard' : user?.role === ROLES.BUYER ? '/buyer/dashboard' : '/admin/dashboard';

  return (
    <div className="landing-page min-h-screen bg-white">
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <Link to="/" className="landing-brand" aria-label="Farm-E home">
            <span className="landing-brand-icon"><Leaf size={19} strokeWidth={2.3} /></span>
            <span>Farm<span className="brand-dash">-</span>E</span>
          </Link>
          <div className="landing-nav-links"><a href="#how-it-works">How it works</a><a href="#why-farme">Why Farm-E</a></div>
          <div className="landing-nav-actions">
            {user ? <Link to={dashboardHref} className="landing-nav-cta">Go to workspace</Link> : <><Link to="/login" className="landing-signin">Sign in</Link><Link to="/register" className="landing-nav-cta">Join Farm-E</Link></>}
          </div>
        </div>
      </nav>

      <main>
        <section className="landing-hero">
          <div className="hero-grain" />
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="hero-kicker">For growers and buyers across India</p>
              <h1>Farmers and buyers.<br />Trading directly.</h1>
              <p className="hero-description">List your harvest or buying request, agree on clear terms, and follow each order through delivery.</p>
              <div className="hero-actions">
                {user ? <Link to={dashboardHref} className="hero-button hero-button-primary">Open your workspace</Link> : <><Link to="/register?role=FARMER" className="hero-button hero-button-primary">I grow produce</Link><Link to="/register?role=BUYER" className="hero-button hero-button-secondary">I’m looking to buy</Link></>}
              </div>
            </div>
            <FieldIllustration />
          </div>
          <div className="hero-bottom-curve" />
        </section>

        <section className="trust-strip" aria-label="Farm-E project facts">
          <div className="trust-inner">{stats.map(({ label, value, icon: Icon }) => <div key={label} className="trust-stat"><span className="trust-icon"><Icon size={16} /></span><span className="trust-copy"><b>{value}</b><small>{label}</small></span></div>)}</div>
        </section>

        <section id="why-farme" className="features-section">
          <div className="section-heading"><h2>Trade details, kept in one place.</h2><p>From the first conversation to final delivery, both sides can see what was agreed.</p></div>
          <div className="features-grid">{features.map(({ icon: Icon, title, desc, tone }) => <article key={title} className="feature-card"><div className={`feature-icon feature-${tone}`}><Icon size={20} strokeWidth={1.9} /></div><h3>{title}</h3><p>{desc}</p></article>)}</div>
        </section>

        <section id="how-it-works" className="journey-section">
          <div className="journey-inner">
            <div className="journey-intro"><h2>From first offer to delivery.</h2><p>Agree on the details, then keep each step of the order visible to both sides.</p><Link to={user ? dashboardHref : '/register'} className="journey-link">{user ? 'Open your workspace' : 'Create an account'}</Link></div>
            <div className="journey-steps">{steps.map(({ icon: Icon, title, copy }, index) => <div key={title} className="journey-step"><div className="step-rail"><span className="step-icon"><Icon size={19} /></span>{index < steps.length - 1 && <span className="step-line" />}</div><div className="step-content"><span className="step-label">Step {index + 1}</span><h3>{title}</h3><p>{copy}</p></div></div>)}</div>
          </div>
        </section>

        <section className="closing-section"><div className="closing-content"><h2>Make your next deal direct.</h2><p>Bring your next harvest or buying request to Farm-E.</p><div className="closing-actions">{user ? <Link to={dashboardHref} className="closing-button">Go to your workspace</Link> : <><Link to="/register" className="closing-button">Create an account</Link><Link to="/login" className="closing-login">Already have an account? Sign in <ChevronRight size={15} /></Link></>}</div></div></section>
      </main>

      <footer className="landing-footer"><Link to="/" className="landing-brand footer-brand"><span className="landing-brand-icon"><Leaf size={17} /></span><span>Farm<span className="brand-dash">-</span>E</span></Link><p>Bringing the people behind our food closer together.</p><span className="footer-country">Made for Indian agriculture</span></footer>
    </div>
  );
};

export default Landing;
