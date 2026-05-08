import React, { useState } from 'react';
import { useTrails } from '../hooks/useTrails';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router';
import { MapPin, Compass } from 'lucide-react';

export default function ExploreTrailsPage() {
  const { trails, updateTrail } = useTrails();
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [filterState, setFilterState] = useState<string>('');

  // Only public trails
  const visibleTrails = trails.filter(t => t.visibility !== 'private');
  
  // Apply filters
  const filteredTrails = visibleTrails.filter(t => {
    if (filterState && t.state !== filterState) return false;
    return true;
  });

  // Sort by higher ranked (ratingTotal / ratingCount)
  const sortedTrails = [...filteredTrails].sort((a, b) => {
    const scoreA = a.ratingCount ? a.ratingTotal! / a.ratingCount : 0;
    const scoreB = b.ratingCount ? b.ratingTotal! / b.ratingCount : 0;
    return scoreB - scoreA;
  });

  return (
    <div className="space-y-6">
      <div className="bg-[#1C2025] p-6 rounded border border-gray-800 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold uppercase tracking-widest text-gray-200 flex items-center gap-2">
            <Compass className="w-5 h-5 text-orange-500" /> Explore Trails
          </h1>
          <p className="text-sm text-gray-400 font-mono mt-1">Discover public off-road routes across the country.</p>
        </div>
        <div>
          <select 
            value={filterState} 
            onChange={(e) => setFilterState(e.target.value)}
            className="p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm focus:border-gray-600 outline-none w-48"
          >
            <option value="">All States</option>
            <option value="CA">California</option>
            <option value="CO">Colorado</option>
            <option value="UT">Utah</option>
            <option value="AZ">Arizona</option>
            <option value="NV">Nevada</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedTrails.length === 0 ? (
          <div className="col-span-full p-12 text-center border border-dashed border-gray-800 rounded bg-[#1C2025]/50">
            <p className="text-gray-500 text-sm font-mono tracking-tighter">No public trails found.</p>
          </div>
        ) : (
          sortedTrails.map(trail => (
            <div key={trail.id} className="bg-[#1C2025] rounded border border-gray-800 overflow-hidden hover:border-gray-700 transition-colors flex flex-col">
              <div className="p-5 flex-1 cursor-pointer" onClick={() => navigate(`/map?trail=${trail.id}`)}>
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-gray-200 text-lg hover:text-orange-500 transition-colors">
                    {trail.name}
                  </h3>
                  <span className={`text-[9px] uppercase tracking-widest font-bold px-2 py-1 rounded border ${
                    trail.difficulty === 'easy' ? 'bg-green-900/30 text-green-500 border-green-500/20' :
                    trail.difficulty === 'moderate' ? 'bg-blue-900/30 text-blue-500 border-blue-500/20' :
                    trail.difficulty === 'hard' ? 'bg-orange-900/30 text-orange-500 border-orange-500/20' :
                    'bg-red-900/30 text-red-500 border-red-500/20'
                  }`}>
                    {trail.difficulty}
                  </span>
                </div>
                
                <div className="flex items-center gap-3 text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-4">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {trail.state || 'Unknown'}</span>
                  <span>•</span>
                  <span>{trail.pattern === 'in_and_out' ? 'In & Out' : 'Through'}</span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">{trail.description}</p>
              </div>

              <div className="bg-[#0F1113] p-4 border-t border-gray-800 flex justify-between items-center">
                <div className="flex items-center gap-1">
                  <span className="text-yellow-500 text-sm">★</span>
                  <span className="text-xs font-mono text-gray-300">
                    {trail.ratingCount ? (trail.ratingTotal! / trail.ratingCount).toFixed(1) : 'No rating'}
                  </span>
                  <span className="text-[10px] text-gray-500 ml-1 font-mono">({trail.ratingCount || 0})</span>
                  
                  {user && (
                    <div className="ml-3 flex items-center gap-1 group/rating cursor-pointer">
                      {[1,2,3,4,5].map(star => (
                        <button
                          key={star}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateTrail(trail.id, {
                              ratingCount: (trail.ratingCount || 0) + 1,
                              ratingTotal: (trail.ratingTotal || 0) + star
                            });
                          }}
                          className="text-gray-600 hover:text-yellow-500 transition-colors opacity-0 group-hover/rating:opacity-100"
                        >
                          ★
                        </button>
                      ))}
                      <span className="text-[10px] uppercase font-bold text-gray-600 tracking-widest group-hover/rating:hidden">Rate</span>
                    </div>
                  )}
                </div>

                <div className="text-[10px] uppercase font-bold tracking-widest text-gray-500 flex items-center gap-2">
                  <span>{trail.waypoints?.length || 0} Waypoints</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
