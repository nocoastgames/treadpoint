import React from 'react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useUsers } from '../../hooks/useUsers';
import { loginWithGoogle, logout } from '../../lib/firebase';
import { Map, List, PlusCircle, LogIn, LogOut, Compass } from 'lucide-react';

export default function Layout() {
  const { user, loading, role } = useAuth();
  const { users } = useUsers();
  
  const currentUserProfile = users.find(u => u.id === user?.uid);

  return (
    <div className="flex flex-col min-h-screen bg-[#0F1113] text-gray-100">
      <header className="sticky top-0 z-50 bg-[#16191D] border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center font-bold text-black italic">T</div>
            <h1 className="text-lg font-bold tracking-tight uppercase">TreadPoint <span className="text-orange-500 underline underline-offset-4">4x4</span></h1>
          </div>
          
          <nav className="flex items-center gap-8 text-sm font-medium">
            <NavLink to="/" className={({isActive}) => `transition-colors ${isActive ? 'text-orange-500' : 'text-gray-400 hover:text-gray-200'}`}>
              Feed
            </NavLink>
            <NavLink to="/explore" className={({isActive}) => `transition-colors ${isActive ? 'text-orange-500' : 'text-gray-400 hover:text-gray-200'}`}>
              Explore Trails
            </NavLink>
            <NavLink to="/map" className={({isActive}) => `transition-colors ${isActive ? 'text-orange-500' : 'text-gray-400 hover:text-gray-200'}`}>
              Map View
            </NavLink>
            
            {loading ? (
              <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse"></div>
            ) : user ? (
              <div className="flex items-center gap-6">
                 {currentUserProfile && (
                   <span className="text-[10px] uppercase font-bold tracking-widest text-orange-500 border border-orange-500/30 bg-orange-500/10 px-2 py-1 rounded">
                     Trail Cred: {currentUserProfile.karma || 0}
                   </span>
                 )}
                 <button onClick={logout} className="text-gray-400 hover:text-red-500 transition-colors uppercase text-[10px] tracking-widest font-bold">
                   Logout
                 </button>
                 {user.photoURL && <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded border border-orange-500" title={role} />}
              </div>
            ) : (
              <button 
                onClick={loginWithGoogle}
                className="bg-orange-500 hover:bg-orange-600 text-black px-4 py-2 rounded font-bold uppercase text-xs tracking-widest transition-colors"
              >
                Login
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
