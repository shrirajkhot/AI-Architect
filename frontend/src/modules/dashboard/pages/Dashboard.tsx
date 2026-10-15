import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../auth/store/AuthContext';
import type { Room } from '../../../shared/api-client/api';
import { getProjects, deleteProject } from '../../../shared/api-client/api';
import { useNavigate } from 'react-router-dom';
import { LogOut, Plus, Trash2, FolderOpen, Search, Sparkles, Building2, Layout, Map } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface ProjectData {
  id: string;
  name: string;
  created_at: string;
  layout_data: { 
    rooms?: Room[];
    floors?: { rooms?: Room[] }[];
    vastuScore?: number;
  };
  image_url: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [vastuFilter, setVastuFilter] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (e) {
      console.error(e);
      toast.error('Session expired. Please log in again.');
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this design?')) return;
    try {
      await deleteProject(id);
      setProjects(projects.filter(p => p.id !== id));
      toast.success('Design deleted');
    } catch {
      toast.error('Failed to delete design');
    }
  };

  const totalRooms = useMemo(() => {
    return Array.isArray(projects) ? projects.reduce((acc, curr) => {
      if (curr.layout_data?.floors) {
        return acc + curr.layout_data.floors.reduce((sum, f) => sum + (f.rooms?.length || 0), 0);
      }
      if (curr.layout_data?.rooms) {
        return acc + (curr.layout_data.rooms.length || 0);
      }
      return acc;
    }, 0) : 0;
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return Array.isArray(projects) ? projects.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const isVastuCompliant = p.layout_data?.vastuScore && p.layout_data.vastuScore > 0;
      const matchesVastu = vastuFilter ? isVastuCompliant : true;
      return matchesSearch && matchesVastu;
    }) : [];
  }, [projects, searchQuery, vastuFilter]);

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)',
      position: 'relative', 
      overflow: 'hidden',
      color: 'var(--text-primary)'
    }}>
      {/* Decorative Background Elements */}
      <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '40vw', height: '40vw', background: 'var(--accent-color)', opacity: 0.05, filter: 'blur(100px)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: '30vw', height: '30vw', background: 'var(--success)', opacity: 0.05, filter: 'blur(100px)', borderRadius: '50%', pointerEvents: 'none' }} />

      {/* Header */}
      <motion.div 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        style={{ 
          background: 'rgba(255, 255, 255, 0.05)', 
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '1.25rem 2.5rem', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          position: 'sticky', 
          top: 0, 
          zIndex: 50,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <motion.div 
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.5 }}
            style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, var(--accent-color), #8B5CF6)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '1.2rem', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)' }}
          >
            A
          </motion.div>
          <span style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, var(--text-primary), var(--text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            AI Architect
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/editor')} 
            className="primary-btn" 
            style={{ padding: '10px 24px', fontSize: '14px', gap: '8px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--accent-color), #6366f1)', border: 'none', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)' }}
          >
            <Plus size={18} /> New Design
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.05, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
            whileTap={{ scale: 0.95 }}
            onClick={logout} 
            className="secondary-btn" 
            style={{ padding: '10px 20px', fontSize: '14px', gap: '8px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'transparent' }}
          >
            <LogOut size={16} /> Logout
          </motion.button>
        </div>
      </motion.div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        style={{ maxWidth: '1400px', margin: '0 auto', padding: '3rem 2rem' }}
      >
        {/* Welcome */}
        <motion.div variants={itemVariants} style={{ marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: '0.5rem' }}>
            Welcome back, <span style={{ background: 'linear-gradient(135deg, var(--accent-color), #8B5CF6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{user?.name}</span> 👋
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '600px', lineHeight: 1.6 }}>
            Ready to build something amazing today? Manage your architectural blueprints, track Vastu scores, and visualize your spaces.
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div variants={itemVariants} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '4rem' }}>
          {[
            { label: 'Total Designs', value: projects.length, icon: <Building2 size={32} />, color: '#6366f1', bg: 'rgba(99, 102, 241, 0.1)' },
            { label: 'Rooms Generated', value: totalRooms, icon: <Layout size={32} />, color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.1)' },
            { label: 'Vastu Compliant', value: projects.filter(p => p.layout_data?.vastuScore && p.layout_data.vastuScore > 0).length, icon: <Sparkles size={32} />, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
          ].map((stat, i) => (
            <motion.div 
              key={i} 
              whileHover={{ y: -5, scale: 1.02 }}
              style={{ 
                padding: '2rem', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                background: 'rgba(255, 255, 255, 0.03)', 
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.1)', 
                borderRadius: '24px', 
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.05)' 
              }}
            >
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem', fontWeight: 600 }}>{stat.label}</p>
                <p style={{ fontSize: '3.5rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, lineHeight: 1 }}>{stat.value}</p>
              </div>
              <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: stat.bg, color: stat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {stat.icon}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Projects Header & Controls */}
        <motion.div variants={itemVariants} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1.5rem' }}>
          <h2 style={{ fontWeight: 800, fontSize: '1.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Map size={28} style={{ color: 'var(--accent-color)' }} />
            Your Blueprints
          </h2>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <motion.div whileFocus={{ scale: 1.02 }} style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Search blueprints..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ 
                  width: '300px', 
                  padding: '12px 16px 12px 48px', 
                  borderRadius: '14px', 
                  border: '1px solid rgba(255, 255, 255, 0.1)', 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  color: 'var(--text-primary)', 
                  fontSize: '1rem', 
                  outline: 'none', 
                  transition: 'all 0.3s',
                  backdropFilter: 'blur(10px)'
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'var(--accent-color)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </motion.div>
            
            <motion.label 
              whileHover={{ scale: 1.02 }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', padding: '10px 16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.1)' }}
            >
              <div style={{
                width: '24px', height: '24px', borderRadius: '8px', 
                background: vastuFilter ? 'var(--accent-color)' : 'transparent',
                border: `2px solid ${vastuFilter ? 'var(--accent-color)' : 'var(--text-secondary)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}>
                <AnimatePresence>
                  {vastuFilter && (
                    <motion.span 
                      initial={{ scale: 0 }} 
                      animate={{ scale: 1 }} 
                      exit={{ scale: 0 }}
                      style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold' }}
                    >
                      ✓
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <input
                type="checkbox"
                checked={vastuFilter}
                onChange={e => setVastuFilter(e.target.checked)}
                style={{ display: 'none' }}
              />
              Vastu-compliant Only
            </motion.label>
          </div>
        </motion.div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '2rem' }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <motion.div 
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }}
                style={{ height: 320, borderRadius: '24px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} 
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <motion.div variants={itemVariants} style={{ textAlign: 'center', padding: '8rem 2rem', background: 'rgba(255, 255, 255, 0.02)', border: '2px dashed rgba(255, 255, 255, 0.1)', borderRadius: '24px', backdropFilter: 'blur(10px)' }}>
            <motion.div 
              animate={{ y: [0, -10, 0] }} 
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <FolderOpen size={80} style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', opacity: 0.5, margin: '0 auto' }} />
            </motion.div>
            <h3 style={{ fontWeight: 900, fontSize: '2rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>No designs yet</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.2rem', maxWidth: '500px', margin: '0 auto 2.5rem' }}>Your workspace is empty. Start your architectural journey by generating your first AI-powered floor plan.</p>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/editor')} 
              className="primary-btn" 
              style={{ padding: '16px 40px', borderRadius: '14px', fontSize: '1.1rem', background: 'linear-gradient(135deg, var(--accent-color), #8B5CF6)', border: 'none', boxShadow: '0 8px 25px rgba(99, 102, 241, 0.4)' }}
            >
              Start Designing Now →
            </motion.button>
          </motion.div>
        ) : filteredProjects.length === 0 ? (
          <motion.div variants={itemVariants} style={{ textAlign: 'center', padding: '6rem 2rem', background: 'rgba(255, 255, 255, 0.02)', border: '2px dashed rgba(255, 255, 255, 0.1)', borderRadius: '24px' }}>
            <h3 style={{ fontWeight: 800, fontSize: '1.8rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>No matching designs found</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Try adjusting your search terms or clearing the Vastu filter.</p>
          </motion.div>
        ) : (
          <motion.div 
            variants={containerVariants}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '2rem' }}
          >
            <AnimatePresence>
              {filteredProjects.map(p => (
                <motion.div
                  key={p.id}
                  variants={itemVariants}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                  whileHover={{ y: -8, scale: 1.02, transition: { duration: 0.2 } }}
                  onClick={() => navigate(`/editor?project=${p.id}`)}
                  style={{ 
                    overflow: 'hidden', 
                    cursor: 'pointer', 
                    background: 'rgba(255, 255, 255, 0.03)', 
                    border: '1px solid rgba(255, 255, 255, 0.1)', 
                    borderRadius: '24px', 
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{ height: '220px', background: 'rgba(0,0,0,0.2)', position: 'relative', overflow: 'hidden' }}>
                    {p.image_url ? (
                      <motion.img 
                        whileHover={{ scale: 1.05 }}
                        transition={{ duration: 0.4 }}
                        src={p.image_url} 
                        alt={p.name} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                    ) : (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '5rem', opacity: 0.2 }}>⬡</div>
                    )}
                    
                    {/* Vastu Badge */}
                    {p.layout_data?.vastuScore && p.layout_data.vastuScore > 0 && (
                      <div style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(16, 185, 129, 0.9)', color: 'white', padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(4px)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                        <Sparkles size={14} /> Vastu: {p.layout_data.vastuScore}
                      </div>
                    )}
                  </div>

                  {/* Card info */}
                  <div style={{ padding: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flex: 1 }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.5rem', fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>{p.name}</h4>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Created {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.1, backgroundColor: 'rgba(239, 68, 68, 0.15)' }}
                      whileTap={{ scale: 0.9 }}
                      onClick={e => handleDelete(p.id, e)}
                      style={{ 
                        padding: '10px', 
                        color: '#ef4444', 
                        borderRadius: '12px', 
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        background: 'rgba(239, 68, 68, 0.05)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                      }}
                      title="Delete Project"
                    >
                      <Trash2 size={18} />
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
