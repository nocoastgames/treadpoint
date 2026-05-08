import React, { useState } from 'react';
import { Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';
import { useLocation } from '../hooks/useLocation';
import { useReports } from '../hooks/useReports';
import { Navigation, AlertTriangle, Image as ImageIcon, MapPin, Gauge, Mountain, Activity, DownloadCloud } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function MapPage() {
  const { location, error, distanceKm, speedMs, elevation } = useLocation();
  const { reports, addReport, upvoteReport, deleteReport } = useReports();
  const { user } = useAuth();
  
  const [showReportForm, setShowReportForm] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [reportType, setReportType] = useState<'condition' | 'waypoint' | 'hazard' | 'scenic'>('waypoint');
  const [reportDesc, setReportDesc] = useState('');

  const defaultCenter = { lat: 39.8283, lng: -98.5795 }; // Center of US
  const center = location || defaultCenter;

  const [mapTypeId, setMapTypeId] = useState<'terrain' | 'satellite' | 'hybrid' | 'roadmap'>('terrain');
  const [mapCenter, setMapCenter] = useState(defaultCenter);

  const map = useMap('DEMO_MAP_ID');

  // Initialize mapCenter once when location first becomes available
  React.useEffect(() => {
    if (location && mapCenter === defaultCenter) {
      setMapCenter(location);
      if (map) {
        map.panTo(location);
      }
    }
  }, [location, map]);

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) return alert("Must have GPS location to drop a report!");
    try {
      await addReport({
        // For now bind to a generic trail, as we haven't selected one
        trailId: 'global',
        type: reportType,
        description: reportDesc,
        lat: location.lat,
        lng: location.lng,
      });
      setShowReportForm(false);
      setReportDesc('');
    } catch (err) {
      console.error(err);
      alert("Failed to report");
    }
  };

  const getPinColor = (type: string) => {
    switch(type) {
      case 'hazard': return '#ef4444'; // red
      case 'scenic': return '#3b82f6'; // blue
      case 'condition': return '#f59e0b'; // amber
      default: return '#10b981'; // green
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] relative bg-[#0B0D0E] border border-gray-800 rounded">
      <Map
        defaultZoom={location ? 14 : 4}
        defaultCenter={mapCenter}
        mapId="DEMO_MAP_ID"
        mapTypeId={mapTypeId}
        disableDefaultUI={false}
        gestureHandling={'greedy'}
      >
        {location && (
          <AdvancedMarker position={location}>
            <div className="relative flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-orange-500 border-2 border-white"></span>
            </div>
          </AdvancedMarker>
        )}

        {reports.map((report) => (
          <AdvancedMarker key={report.id} position={{lat: report.lat, lng: report.lng}}>
            <Pin background={getPinColor(report.type)} borderColor={'#fff'} glyphColor={'#fff'} />
          </AdvancedMarker>
        ))}
      </Map>

      {/* Real-time HUD */}
      <div className="absolute top-6 left-6 w-72 bg-[#16191D]/90 backdrop-blur-md p-6 rounded-lg border border-gray-700 shadow-2xl flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
            <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">GPS Active</span>
          </div>
          <button 
            onClick={() => setShowOfflineModal(true)}
            className="text-[10px] uppercase font-bold text-gray-500 hover:text-white border border-gray-700 px-2 py-1 rounded"
          >
            Offline
          </button>
        </div>

        {/* Layer Controls */}
        <div className="flex bg-[#1C2025] rounded border border-gray-700 overflow-hidden">
          <button onClick={() => setMapTypeId('terrain')} className={`flex-1 py-1 text-[10px] uppercase font-bold tracking-widest transition-colors ${mapTypeId === 'terrain' ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`}>Terrain</button>
          <button onClick={() => setMapTypeId('satellite')} className={`flex-1 py-1 text-[10px] uppercase font-bold tracking-widest transition-colors border-l border-r border-gray-700 ${mapTypeId === 'satellite' ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`}>Sat</button>
          <button onClick={() => setMapTypeId('hybrid')} className={`flex-1 py-1 text-[10px] uppercase font-bold tracking-widest transition-colors ${mapTypeId === 'hybrid' ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`}>Hyb</button>
        </div>
        
        <div className="bg-[#1C2025] p-4 rounded border border-gray-800 flex justify-between">
          <div>
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Speed</span>
            <p className="text-2xl font-mono text-gray-100">{(speedMs * 2.23694).toFixed(1)}<span className="text-sm ml-1 text-gray-500">mph</span></p>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Dist</span>
            <p className="text-2xl font-mono text-orange-500">{(distanceKm * 0.621371).toFixed(1)}<span className="text-sm ml-1 text-gray-500">mi</span></p>
          </div>
        </div>

        <div className="bg-[#1C2025] p-4 rounded border border-gray-800">
          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Elevation Gain</span>
          <div className="flex items-baseline gap-1">
            <p className="text-2xl font-mono text-gray-100">{elevation ? (elevation * 3.28084).toFixed(0) : '--'}</p>
            <p className="text-xs text-gray-500">ft</p>
          </div>
        </div>
      </div>

      {/* Floating Action for Reporting */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4">
        <button 
          onClick={() => setShowReportForm(!showReportForm)}
          className="bg-[#16191D]/95 backdrop-blur-md border border-gray-700 rounded-full px-6 py-3 shadow-xl text-xs uppercase font-bold text-orange-500 hover:text-orange-400 transition-colors"
        >
          Report Condition
        </button>
      </div>

      {showReportForm && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#16191D]/95 p-6 rounded border border-gray-700 w-full max-w-sm z-50 shadow-2xl backdrop-blur-md">
          <h3 className="text-[10px] font-bold uppercase text-gray-500 mb-4 tracking-widest">Add Report Here</h3>
          {!user ? (
            <p className="text-sm text-gray-400 mb-4">Please log in to report conditions.</p>
          ) : !location ? (
            <p className="text-sm text-gray-400 mb-4">Waiting for GPS location...</p>
          ) : (
            <form onSubmit={handleCreateReport} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'hazard', label: 'Hazard' },
                  { id: 'condition', label: 'Condition' },
                  { id: 'waypoint', label: 'Waypoint' },
                  { id: 'scenic', label: 'Scenic' },
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setReportType(t.id as any)}
                    className={`flex flex-col items-center justify-center p-3 rounded border transition-all ${
                      reportType === t.id 
                        ? 'border-orange-500 bg-orange-500/10 text-orange-500' 
                        : 'border-gray-800 bg-[#1C2025] hover:border-gray-700 text-gray-400'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-bold tracking-tighter">{t.label}</span>
                  </button>
                ))}
              </div>
              <textarea 
                value={reportDesc}
                onChange={e => setReportDesc(e.target.value)}
                placeholder="Describe the condition..."
                className="p-3 border rounded resize-none h-24 focus:ring-1 focus:ring-orange-500 border-gray-800 bg-[#1C2025] text-gray-200 text-sm font-sans outline-none placeholder:text-gray-600"
                required
              />
              <div className="flex gap-2 justify-end mt-2">
                <button type="button" onClick={() => setShowReportForm(false)} className="px-4 py-2 text-[10px] uppercase font-bold text-gray-500 hover:text-gray-300 transition-colors border border-transparent hover:border-gray-700 rounded">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-orange-500 text-black text-[10px] uppercase font-bold tracking-widest rounded hover:bg-orange-600 transition-colors">Drop Pin</button>
              </div>
            </form>
          )}
        </div>
      )}

      {showOfflineModal && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#16191D]/95 p-6 rounded border border-gray-700 w-full max-w-sm z-50 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3 mb-4 text-gray-100">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Offline Cache</h3>
          </div>
          <p className="text-gray-400 text-sm mb-6">
            Caching trail maps for offline usage requires the native app mode to persist map tiles locally. In the browser preview, standard caching is used for recent map areas.
          </p>
          <div className="h-2 w-full bg-gray-800 rounded mb-2">
            <div className="h-full bg-orange-500 w-3/4 rounded"></div>
          </div>
          <p className="text-[10px] text-gray-500 uppercase tracking-tighter mb-6 text-right font-bold"><span className="text-orange-500">75%</span> Cached</p>
          
          <div className="flex justify-end mt-2">
            <button type="button" onClick={() => setShowOfflineModal(false)} className="px-4 py-2 border border-gray-700 text-gray-100 text-[10px] uppercase font-bold tracking-widest rounded hover:bg-gray-800 transition-colors">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
