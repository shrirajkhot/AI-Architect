

export default function FloatingOrbs() {


  return (
    <>
      <div className="orb" style={{ position: 'fixed', top: '10%', left: '5%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,112,243,0.1), transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div className="orb" style={{ position: 'fixed', top: '40%', right: '3%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(121,40,202,0.08), transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div className="orb" style={{ position: 'fixed', bottom: '5%', left: '30%', width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,200,150,0.06), transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
    </>
  );
}
