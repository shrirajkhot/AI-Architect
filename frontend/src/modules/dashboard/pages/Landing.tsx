import React from 'react';
import { Link } from 'react-router-dom';
import { Sun, Compass, Layers, FileDown } from 'lucide-react';

const MAX = { maxWidth: 1200, margin: '0 auto', padding: '0 2rem' };

function Fade({ children, delay = 0 }: { children: React.ReactNode, delay?: number }) {
  return (
    <div style={{ animation: `fadeInUp 0.8s ease forwards`, animationDelay: `${delay}s`, opacity: 0 }}>
      {children}
    </div>
  );
}

export default function Landing() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-primary)' }}>
      {/* Header */}
      <header style={{ padding: '24px 0', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ ...MAX, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '32px', height: '32px', background: 'var(--accent-color)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '1.2rem' }}>
              A
            </div>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              AI Architect
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem', fontSize: '0.95rem', fontWeight: 600 }}>
            <a href="#features" style={{ color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color='var(--accent-color)'} onMouseOut={e => e.currentTarget.style.color='var(--text-secondary)'}>Features</a>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Link to="/login" style={{ color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color='var(--text-primary)'} onMouseOut={e => e.currentTarget.style.color='var(--text-secondary)'}>Log In</Link>
              <Link to="/register" style={{ padding: '10px 20px', background: 'var(--text-primary)', color: 'var(--bg-primary)', borderRadius: '8px', textDecoration: 'none', transition: 'transform 0.2s' }} onMouseOver={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseOut={e=>e.currentTarget.style.transform='none'}>Get Started</Link>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section style={{ padding: '100px 0 120px 0', position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-card) 100%)' }}>
          <div style={{ ...MAX, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'center' }}>
            <Fade>
              <h1 style={{ fontSize: '4.5rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '24px', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
                Design Intelligent Floor Plans, <span style={{ color: 'var(--accent-color)' }}>Instantly.</span>
              </h1>
              <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '48px', maxWidth: '540px' }}>
                Transform your architectural vision into structurally sound, Vastu-compliant, and mathematically optimized floor plans in seconds.
              </p>
              <div style={{ display: 'flex', gap: '16px' }}>
                <Link to="/register" className="primary-btn" style={{ padding: '16px 32px', fontSize: '1.05rem', fontWeight: 700, borderRadius: '8px', textDecoration: 'none' }}>
                  Start Generating Free
                </Link>
                <a href="#features" style={{ padding: '16px 32px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none', transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)' }}
                  onMouseOver={e => { e.currentTarget.style.boxShadow = 'var(--shadow-elevated)'; e.currentTarget.style.transform = 'translateY(-2px)'}}
                  onMouseOut={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'none'}}
                >
                  Explore Features
                </a>
              </div>
            </Fade>

            <Fade delay={0.15}>
              <div style={{ borderRadius: '24px', overflow: 'hidden', boxShadow: '0 30px 60px -15px rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', transform: 'perspective(1000px) rotateY(-5deg) scale(1.05)' }}>
                <img src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80" alt="AI Architecture Generation" style={{ width: '100%', display: 'block' }} />
              </div>
            </Fade>
          </div>
        </section>

        {/* Features Bento Grid */}
        <section id="features" style={{ padding: '120px 0', background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ ...MAX }}>
            <Fade>
              <div style={{ textAlign: 'center', marginBottom: '80px' }}>
                <div style={{ color: 'var(--accent-color)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px', fontSize: '0.9rem' }}>Comprehensive Suite</div>
                <h2 style={{ fontSize: '3rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Powerful features for modern architects</h2>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px' }}>
                {/* Large Feature with Image */}
                <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', padding: '64px', borderRadius: '24px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)' }}>
                  <div>
                    <div style={{ width: '56px', height: '56px', background: 'var(--accent-glow)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '32px' }}>
                      <Compass size={28} color="var(--accent-color)" />
                    </div>
                    <h3 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '16px', color: 'var(--text-primary)' }}>Intelligent Layout & Compliance</h3>
                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '1.1rem', marginBottom: '24px' }}>
                      Our Generative Layout Engine instantly generates accurate 2D layouts using smart geometry packing. The built-in rule engine continuously grades your designs against traditional Vaastu Shastra guidelines and National Building Code (NBC) structural standards in real-time.
                    </p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--text-secondary)', fontSize: '1.05rem' }}>
                      <li style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>✓ Real-time Vaastu Scoring</li>
                      <li style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>✓ NBC Setback Validations</li>
                      <li style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>✓ Automated Room Placement</li>
                    </ul>
                  </div>
                  <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                     <img src="https://images.unsplash.com/photo-1503387762-592deb58ef4e?ixlib=rb-4.0.3&auto=format&fit=crop&w=2071&q=80" alt="Vaastu and Sunlight Dashboard" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                </div>

                <div style={{ padding: '40px', borderRadius: '24px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', transition: 'transform 0.3s' }} onMouseOver={e=>e.currentTarget.style.transform='translateY(-4px)'} onMouseOut={e=>e.currentTarget.style.transform='none'}>
                  <div style={{ width: '48px', height: '48px', background: 'var(--bg-secondary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                    <Sun size={24} color="var(--text-primary)" />
                  </div>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '16px', color: 'var(--text-primary)' }}>Sunlight Optimization</h3>
                  <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '1rem' }}>
                    Simulates directional sunlight exposure per room to maximize natural lighting and improve long-term energy efficiency of your designs.
                  </p>
                </div>

                <div style={{ padding: '40px', borderRadius: '24px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', transition: 'transform 0.3s' }} onMouseOver={e=>e.currentTarget.style.transform='translateY(-4px)'} onMouseOut={e=>e.currentTarget.style.transform='none'}>
                  <div style={{ width: '48px', height: '48px', background: 'var(--bg-secondary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                    <Layers size={24} color="var(--text-primary)" />
                  </div>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '16px', color: 'var(--text-primary)' }}>Instant 3D Generation</h3>
                  <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '1rem' }}>
                    Instantly view your generated 2D floor plans in an interactive 3D space. Manipulate walls and layout nodes and see changes reflect dynamically.
                  </p>
                </div>

                <div style={{ padding: '40px', borderRadius: '24px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', transition: 'transform 0.3s' }} onMouseOver={e=>e.currentTarget.style.transform='translateY(-4px)'} onMouseOut={e=>e.currentTarget.style.transform='none'}>
                  <div style={{ width: '48px', height: '48px', background: 'var(--bg-secondary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                    <FileDown size={24} color="var(--text-primary)" />
                  </div>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '16px', color: 'var(--text-primary)' }}>Precision DXF Export</h3>
                  <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '1rem' }}>
                    Export your intelligent layouts directly to precision DXF files, completely ready for use in AutoCAD or other professional CAD software.
                  </p>
                </div>
              </div>
            </Fade>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ padding: '48px 0', background: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ ...MAX }}>
          <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>AI Architect &copy; 2026. Final Year Project.</p>
        </div>
      </footer>
      
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
