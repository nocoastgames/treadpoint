import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTrails } from '../hooks/useTrails';
import { useReports } from '../hooks/useReports';
import { useRides } from '../hooks/useRides';
import { useNomadRequests } from '../hooks/useNomadRequests';
import { useAuth } from '../contexts/AuthContext';
import { Navigation, Clock, ThumbsUp, MapPin, Plus, Calendar, Users, Sparkles, Send } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { searchTrailInfo } from '../lib/gemini';

export default function FeedPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { trails, loading: trailsLoading, addTrail, updateTrail, deleteTrail } = useTrails();
  const { reports, upvoteReport, deleteReport } = useReports();
  const { rides, addRide, joinRide } = useRides();
  
  const [showAddTrail, setShowAddTrail] = useState(false);
  const [trailName, setTrailName] = useState('');
  const [trailDesc, setTrailDesc] = useState('');
  const [trailDiff, setTrailDiff] = useState<'easy'|'moderate'|'hard'|'extreme'>('moderate');
  const [trailLat, setTrailLat] = useState<number>(0);
  const [trailLng, setTrailLng] = useState<number>(0);
  const [trailState, setTrailState] = useState<string>('');
  const [trailPattern, setTrailPattern] = useState<'through'|'in_and_out'>('through');
  const [trailVisibility, setTrailVisibility] = useState<'public'|'private'>('public');
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [editingTrailId, setEditingTrailId] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<string>('');

  const [showAddRide, setShowAddRide] = useState(false);
  const [rideTitle, setRideTitle] = useState('');
  const [rideTrailId, setRideTrailId] = useState('');
  const [rideDate, setRideDate] = useState<Date | null>(null);
  const [rideDateType, setRideDateType] = useState<'fixed'|'poll'>('fixed');
  const [ridePollDates, setRidePollDates] = useState<Date[]>([]);
  const [newPollDate, setNewPollDate] = useState<Date | null>(null);
  const [rideVisibility, setRideVisibility] = useState<'public'|'private'>('public');

  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void, onCancel?: () => void } | null>(null);

  const { addNomadRequest, nomadRequests } = useNomadRequests();
  const [showNomad, setShowNomad] = useState(false);
  const [nomadState, setNomadState] = useState('');
  const [nomadStart, setNomadStart] = useState<Date | null>(null);
  const [nomadEnd, setNomadEnd] = useState<Date | null>(null);
  const [nomadMsg, setNomadMsg] = useState('');

  const handleAddTrail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (editingTrailId) {
      await updateTrail(editingTrailId, {
        name: trailName,
        description: trailDesc,
        difficulty: trailDiff,
        lat: trailLat,
        lng: trailLng,
        state: trailState,
        pattern: trailPattern,
        visibility: trailVisibility
      });
      setEditingTrailId(null);
    } else {
      await addTrail({
        name: trailName,
        description: trailDesc,
        difficulty: trailDiff,
        lat: trailLat,
        lng: trailLng,
        state: trailState,
        pattern: trailPattern,
        visibility: trailVisibility,
        creatorId: user.uid
      });
    }
    
    setShowAddTrail(false);
    setTrailName('');
    setTrailDesc('');
    setTrailDiff('moderate');
    setTrailLat(0);
    setTrailLng(0);
    setTrailState('');
    setTrailPattern('through');
    setTrailVisibility('public');
  };

  const handleAISearch = async () => {
    if (!trailName.trim()) return;
    setIsSearchingAI(true);
    try {
      const info = await searchTrailInfo(trailName);
      setTrailDesc(info.description || '');
      if (info.difficulty) setTrailDiff(info.difficulty);
      if (info.lat) setTrailLat(info.lat);
      if (info.lng) setTrailLng(info.lng);
    } catch (err) {
      console.error(err);
      alert('Failed to search trail info using AI.');
    } finally {
      setIsSearchingAI(false);
    }
  };

  const handleAddRide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || role !== 'advanced') return;
    try {
      const newRideId = await addRide({
        title: rideTitle,
        trailId: rideTrailId,
        date: rideDateType === 'fixed' ? (rideDate ? rideDate.toISOString() : new Date().toISOString()) : new Date().toISOString(),
        dateType: rideDateType,
        dateOptions: rideDateType === 'poll' ? ridePollDates.map(d => d.toISOString()) : [],
        status: 'planned',
        visibility: rideVisibility
      });
      navigate(`/ride/${newRideId}`);
    } catch (e) {
      console.error('Failed to add ride', e);
    }
  };

  const handleNomadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await addNomadRequest({
        state: nomadState,
        startDate: nomadStart ? nomadStart.toISOString() : new Date().toISOString(),
        endDate: nomadEnd ? nomadEnd.toISOString() : new Date().toISOString(),
        message: nomadMsg,
      });
      setShowNomad(false);
      setNomadState('');
      setNomadStart(null);
      setNomadEnd(null);
      setNomadMsg('');
      alert("Nomad Request broadcasted successfully!");
    } catch (e) {
      console.error('Nomad Request Failed', e);
    }
  };

  const publicRides = rides.filter(r => r.visibility !== 'private' || r.organizerId === user?.uid);
  const myTrails = user ? trails.filter(t => t.creatorId === user.uid) : [];

  // Find Nomad Requests matching user's pending rides' state and date
  const myRides = user ? rides.filter(r => r.organizerId === user.uid) : [];
  const relevantNomadRequests = nomadRequests.filter(req => {
    if (req.userId === user?.uid) return false; // don't show my own
    return myRides.some(ride => {
      const trail = trails.find(t => t.id === ride.trailId);
      if (!trail) return false;
      if (trail.state !== req.state) return false;
      const rDate = new Date(ride.date).getTime();
      const sDate = new Date(req.startDate).getTime();
      const eDate = new Date(req.endDate).getTime();
      return rDate >= sDate && rDate <= eDate;
    });
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-[#1C2025] p-6 rounded border border-gray-800 shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-100 mb-4">{confirmDialog.message}</h3>
            <div className="flex gap-3 justify-end mt-8">
              <button 
                onClick={() => {
                  if (confirmDialog.onCancel) confirmDialog.onCancel();
                  setConfirmDialog(null);
                }}
                className="px-4 py-2 rounded text-gray-400 hover:bg-gray-800 transition-colors"
                type="button"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="px-4 py-2 rounded bg-orange-500 hover:bg-orange-600 text-black font-bold transition-colors"
                type="button"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Main Feed: Recent Reports & Organized Rides */}
      <div className="lg:col-span-2 space-y-8">
        
        {relevantNomadRequests.length > 0 && (
          <section className="bg-blue-900/10 border border-blue-900/50 p-6 rounded-lg space-y-4">
             <div className="flex items-center gap-2 mb-2">
               <Send className="w-4 h-4 text-blue-500" />
               <h2 className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Relevant Nomad Broadcasts!</h2>
             </div>
             <div className="space-y-3">
               {relevantNomadRequests.map(req => (
                 <div key={req.id} className="bg-[#1C2025] p-4 rounded border border-blue-900/40">
                   <p className="text-gray-300 text-sm leading-relaxed">"{req.message}"</p>
                   <div className="mt-3 flex items-center justify-between text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                     <span>Visiting {req.state}</span>
                     <span>{format(new Date(req.startDate), 'MMM d')} - {format(new Date(req.endDate), 'MMM d, yyyy')}</span>
                   </div>
                 </div>
               ))}
             </div>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Organized Rides</h2>
            {role === 'advanced' && (
              <button 
                onClick={() => setShowAddRide(!showAddRide)}
                className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-orange-500 border border-gray-800 hover:border-gray-700 px-3 py-1.5 rounded transition-colors"
              >
                <Plus className="w-3 h-3" /> Plan Ride
              </button>
            )}
          </div>

          {showAddRide && (
            <form onSubmit={handleAddRide} className="bg-[#1C2025] p-5 rounded border border-gray-800 flex flex-col gap-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Plan a New Ride</h3>
              <input 
                required value={rideTitle} onChange={e => setRideTitle(e.target.value)}
                placeholder="Ride Title (e.g. Weekend Mudding)" className="p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm placeholder:text-gray-600 focus:border-gray-600 outline-none"
              />
              <select required value={rideTrailId} onChange={e => setRideTrailId(e.target.value)} className="p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm focus:border-gray-600 outline-none">
                <option value="" disabled>Select Trail</option>
                {trails.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              
              <div className="flex gap-2 mb-2">
                <button 
                  type="button" 
                  onClick={() => setRideDateType('fixed')} 
                  className={`flex-1 py-2 text-[10px] uppercase font-bold tracking-widest rounded transition-colors ${rideDateType === 'fixed' ? 'bg-orange-500 text-black' : 'bg-gray-800 text-gray-400'}`}
                >Fixed Date</button>
                <button 
                  type="button" 
                  onClick={() => setRideDateType('poll')} 
                  className={`flex-1 py-2 text-[10px] uppercase font-bold tracking-widest rounded transition-colors ${rideDateType === 'poll' ? 'bg-orange-500 text-black' : 'bg-gray-800 text-gray-400'}`}
                >Date Poll</button>
              </div>

              {rideDateType === 'fixed' ? (
                <div className="w-full">
                  <DatePicker
                    selected={rideDate}
                    onChange={(date) => setRideDate(date as Date)}
                    showTimeSelect
                    dateFormat="Pp"
                    placeholderText="Select Date & Time"
                    className="w-full p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm focus:border-gray-600 outline-none"
                    wrapperClassName="w-full"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <DatePicker
                        selected={newPollDate}
                        onChange={(date) => setNewPollDate(date as Date)}
                        dateFormat="yyyy-MM-dd"
                        placeholderText="Select Poll Date"
                        className="w-full p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm focus:border-gray-600 outline-none"
                        wrapperClassName="w-full"
                      />
                    </div>
                    <button 
                      type="button" 
                      onClick={() => {
                        if (newPollDate && !ridePollDates.some(d => d.getTime() === newPollDate.getTime())) {
                          setRidePollDates([...ridePollDates, newPollDate]);
                          setNewPollDate(null);
                        }
                      }}
                      className="px-4 bg-gray-800 hover:bg-gray-700 text-white rounded text-[10px] uppercase font-bold transition-colors"
                    >Add</button>
                  </div>
                  {ridePollDates.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {ridePollDates.map((d, i) => (
                        <div key={i} className="flex items-center gap-1 bg-gray-800 px-2 py-1 rounded text-xs text-gray-300">
                          {format(d, "MMM d, yyyy")}
                          <button type="button" onClick={() => setRidePollDates(ridePollDates.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 ml-1">&times;</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              <select required value={rideVisibility} onChange={e => setRideVisibility(e.target.value as any)} className="p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm focus:border-gray-600 outline-none">
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
              <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-black font-bold uppercase tracking-widest text-[10px] py-3 rounded transition-colors">Plan Ride</button>
            </form>
          )}

          {publicRides.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-gray-800 rounded bg-[#1C2025]/50">
              <p className="text-gray-500 text-sm font-mono tracking-tighter">No rides planned right now.</p>
            </div>
          ) : (
            publicRides.map(ride => {
              const trail = trails.find(t => t.id === ride.trailId);
              return (
                <div key={ride.id} onClick={() => navigate(`/ride/${ride.id}`)} className="bg-[#1C2025] cursor-pointer p-5 rounded border border-gray-800 hover:border-gray-700 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-bold text-gray-100">{ride.title}</h3>
                      <p className="text-gray-400 flex items-center gap-2 text-xs mt-2 font-mono">
                        <MapPin className="w-3 h-3 text-orange-500" /> {trail?.name || 'Unknown Trail'}
                      </p>
                      <p className="text-gray-400 flex items-center gap-2 text-xs mt-1 font-mono">
                        <Calendar className="w-3 h-3 text-orange-500" /> 
                        {ride.dateType === 'poll' ? "Date Poll Active" : format(new Date(ride.date), "PPP 'at' p")}
                      </p>
                    </div>
                    {user && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); joinRide(ride.id, ride.visibility === 'private'); }}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2 rounded text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 transition-colors border border-gray-700"
                      >
                         Join
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Real-Time Trail Conditions</h2>
          </div>
          
          {reports.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-gray-800 rounded bg-[#1C2025]/50">
              <MapPin className="mx-auto w-8 h-8 text-gray-700 mb-4" />
              <p className="text-gray-500 text-sm font-mono tracking-tighter">No recent reports found.</p>
            </div>
          ) : (
            reports.map(report => (
              <div key={report.id} className="bg-[#1C2025] p-5 rounded shadow-sm border border-gray-800 hover:border-gray-700 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded border border-gray-700 bg-[#0F1113] flex items-center justify-center text-orange-500">
                      {report.type === 'hazard' && <span className="text-red-500 text-xs font-bold uppercase">Haz</span>}
                      {report.type === 'condition' && <span className="text-orange-500 text-xs font-bold uppercase">Con</span>}
                      {report.type === 'scenic' && <span className="text-blue-500 text-xs font-bold uppercase">Sce</span>}
                      {report.type === 'waypoint' && <span className="text-green-500 text-xs font-bold uppercase">Way</span>}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-gray-200 capitalize">{report.type} Report</h3>
                      <div className="flex items-center text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-widest">
                        {report.createdAt ? formatDistanceToNow(new Date(report.createdAt), { addSuffix: true }) : 'Just now'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    {user?.uid === report.authorId && (
                      <button 
                        onClick={() => deleteReport(report.id)}
                        className="flex flex-col items-center p-2 border border-transparent hover:border-red-900 hover:bg-red-900/10 rounded transition-colors group"
                      >
                        <span className="text-[10px] uppercase font-bold text-gray-500 group-hover:text-red-500">X</span>
                      </button>
                    )}
                    <button 
                      onClick={() => upvoteReport(report.id, report.upvotes)}
                      className="flex flex-col items-center p-2 border border-transparent hover:border-gray-700 hover:bg-[#0F1113] rounded transition-colors group"
                    >
                      <span className="text-[10px] uppercase font-bold text-gray-500 group-hover:text-orange-500">▲</span>
                      <span className="text-xs font-mono font-bold text-gray-400 group-hover:text-orange-500">{report.upvotes}</span>
                    </button>
                  </div>
                </div>
                
                <div className="mt-4">
                  <p className="text-gray-300 text-sm leading-relaxed">{report.description}</p>
                  <div className="mt-4 inline-flex items-center gap-1.5 px-2 py-1 bg-[#0F1113] border border-gray-800 rounded text-[10px] font-mono text-gray-500">
                    <MapPin className="w-3 h-3 text-gray-600" />
                    {report.lat.toFixed(4)}, {report.lng.toFixed(4)}
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      {/* Sidebar: Popular Trails */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
            My Routes
          </h2>
          <div className="flex gap-2 items-center">
            <select 
              value={filterState} 
              onChange={e => setFilterState(e.target.value)}
              className="bg-transparent border border-gray-700 text-gray-300 text-[10px] uppercase font-bold tracking-widest rounded px-2 py-1 outline-none"
            >
              <option value="">All States</option>
              <option value="CA">CA</option>
              <option value="CO">CO</option>
              <option value="UT">UT</option>
              <option value="AZ">AZ</option>
              <option value="NV">NV</option>
            </select>
            {user && (
              <button 
                onClick={() => setShowNomad(!showNomad)}
                className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-blue-400 border border-transparent hover:border-gray-700 px-2 py-1 rounded transition-colors ml-2"
              >
                <Send className="w-3 h-3" /> Nomad
              </button>
            )}
            {user && (
              <button 
                onClick={() => setShowAddTrail(!showAddTrail)}
                className="text-[10px] uppercase tracking-widest font-bold text-orange-500 border border-transparent hover:border-gray-700 px-2 py-1 rounded transition-colors"

              >
                Add Trail
              </button>
            )}
          </div>
        </div>

        {showNomad && (
          <form onSubmit={handleNomadSubmit} className="bg-[#1C2025] p-5 rounded border border-blue-900/50 flex flex-col gap-4 mb-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Broadcast Nomad Request</h3>
            <p className="text-xs text-gray-400">Visiting a new area? Send a broadcast to all organizers planning rides while you are there.</p>
            
            <select required value={nomadState} onChange={e => setNomadState(e.target.value)} className="p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm focus:border-gray-600 outline-none">
              <option value="" disabled>Select State</option>
              <option value="CA">California</option>
              <option value="CO">Colorado</option>
              <option value="UT">Utah</option>
              <option value="AZ">Arizona</option>
              <option value="NV">Nevada</option>
            </select>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">From</label>
                <DatePicker
                  selected={nomadStart}
                  onChange={(date) => setNomadStart(date as Date)}
                  dateFormat="yyyy-MM-dd"
                  className="w-full p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm focus:border-gray-600 outline-none"
                  wrapperClassName="w-full"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">To</label>
                <DatePicker
                  selected={nomadEnd}
                  onChange={(date) => setNomadEnd(date as Date)}
                  dateFormat="yyyy-MM-dd"
                  className="w-full p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm focus:border-gray-600 outline-none"
                  wrapperClassName="w-full"
                />
              </div>
            </div>

            <textarea 
              required value={nomadMsg} onChange={e => setNomadMsg(e.target.value)}
              placeholder="Hi, I'll be in town and looking for a group!" className="p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm placeholder:text-gray-600 focus:border-gray-600 outline-none h-20 resize-none"
            />
            
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white tracking-widest text-[10px] uppercase font-bold py-3 rounded transition-colors">
              Broadcast Request
            </button>
          </form>
        )}

        {showAddTrail && (
          <form onSubmit={handleAddTrail} className="bg-[#1C2025] p-5 rounded border border-gray-800 flex flex-col gap-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              {editingTrailId ? 'Edit Trail' : 'Add New Trail'}
            </h3>
            
            <div className="flex gap-2">
              <input 
                required value={trailName} onChange={e => setTrailName(e.target.value)}
                placeholder="Trail Name" className="flex-1 p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm placeholder:text-gray-600 focus:border-gray-600 outline-none"
              />
              <button
                type="button"
                onClick={handleAISearch}
                disabled={!trailName.trim() || isSearchingAI}
                className="px-3 bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded flex items-center justify-center disabled:opacity-50 hover:bg-blue-500/20 transition-colors"
                title="Search internet for info & coordinates"
              >
                <Sparkles className={`w-4 h-4 ${isSearchingAI ? 'animate-pulse' : ''}`} />
              </button>
            </div>

            <textarea 
               value={trailDesc} onChange={e => setTrailDesc(e.target.value)}
              placeholder="Description (Optional)" className="p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm placeholder:text-gray-600 focus:border-gray-600 outline-none h-20 resize-none"
            />
            
            <div className="grid grid-cols-2 gap-2">
              <input 
                type="number" step="any" value={trailLat || ''} onChange={e => setTrailLat(parseFloat(e.target.value))}
                placeholder="Latitude" className="p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm placeholder:text-gray-600 focus:border-gray-600 outline-none"
                required
              />
              <input 
                type="number" step="any" value={trailLng || ''} onChange={e => setTrailLng(parseFloat(e.target.value))}
                placeholder="Longitude" className="p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm placeholder:text-gray-600 focus:border-gray-600 outline-none"
                required
              />
            </div>

            <div className="flex gap-2">
              <select 
                value={trailState} onChange={e => setTrailState(e.target.value)}
                className="flex-1 p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm focus:border-gray-600 outline-none"
              >
                <option value="">State (Optional)</option>
                <option value="CA">California</option>
                <option value="CO">Colorado</option>
                <option value="UT">Utah</option>
                <option value="AZ">Arizona</option>
                <option value="NV">Nevada</option>
              </select>

              <select 
                value={trailDiff} onChange={e => setTrailDiff(e.target.value as any)}
                className="flex-1 p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm focus:border-gray-600 outline-none"
              >
                <option value="easy">Easy</option>
                <option value="moderate">Moderate</option>
                <option value="hard">Hard</option>
                <option value="extreme">Extreme</option>
              </select>
            </div>

            <div className="flex gap-2">
              <select 
                value={trailPattern} onChange={e => setTrailPattern(e.target.value as any)}
                className="flex-1 p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm focus:border-gray-600 outline-none"
              >
                <option value="through">Through Trail (Point A -{'>'} B)</option>
                <option value="in_and_out">In &amp; Out (Point A -{'>'} B -{'>'} A)</option>
              </select>
              <select 
                value={trailVisibility} onChange={e => setTrailVisibility(e.target.value as any)}
                className="flex-1 p-3 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm focus:border-gray-600 outline-none"
              >
                <option value="public">Public Trail</option>
                <option value="private">Private Trail</option>
              </select>
            </div>
            
            {editingTrailId && (
              <div className="bg-[#0F1113] p-3 border border-gray-800 rounded flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-500">Merge Waypoints From:</span>
                <select 
                  className="flex-1 bg-transparent text-sm text-gray-200 outline-none"
                  onChange={async (e) => {
                    const targetId = e.target.value;
                    if (!targetId) return;
                    setConfirmDialog({
                      message: "This will append the other trail's waypoints to this trail. Are you sure?",
                      onConfirm: async () => {
                        const targetTrail = trails.find(t => t.id === targetId);
                        if (targetTrail && targetTrail.waypoints && targetTrail.waypoints.length > 0) {
                          const currentTrail = trails.find(t => t.id === editingTrailId);
                          const mergedWaypoints = [...(currentTrail?.waypoints || []), ...targetTrail.waypoints];
                          await updateTrail(editingTrailId, { waypoints: mergedWaypoints });
                          alert('Waypoints merged successfully.');
                        } else {
                          alert('Selected trail has no waypoints.');
                        }
                        e.target.value = '';
                      },
                      onCancel: () => {
                        e.target.value = '';
                      }
                    });
                  }}
                >
                  <option value="">Select a trail to merge...</option>
                  {trails.filter(t => t.id !== editingTrailId).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="flex gap-2">
              {editingTrailId && (
                <button type="button" onClick={() => { setEditingTrailId(null); setShowAddTrail(false); }} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 tracking-widest text-[10px] uppercase font-bold py-3 rounded transition-colors">Cancel</button>
              )}
              <button type="submit" className="flex-1 bg-orange-500 hover:bg-orange-600 text-black tracking-widest text-[10px] uppercase font-bold py-3 rounded transition-colors">
                {editingTrailId ? 'Update Trail' : 'Save Trail'}
              </button>
            </div>
          </form>
        )}

        {trailsLoading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-[#1C2025] border border-gray-800 rounded animate-pulse"></div>)}
          </div>
        ) : !user ? (
          <p className="text-gray-500 text-sm font-mono tracking-tighter">Login to create and view your custom trails.</p>
        ) : myTrails.filter(t => !filterState || t.state === filterState).length === 0 ? (
          <p className="text-gray-500 text-sm font-mono tracking-tighter">You have not created any trails yet.</p>
        ) : (
          myTrails.filter(t => !filterState || t.state === filterState).map(trail => (
            <div key={trail.id} className="bg-[#1C2025] p-4 rounded border border-gray-800 hover:border-gray-700 transition-colors group">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-bold text-gray-200 group-hover:text-orange-500 transition-colors">
                  {trail.name} {trail.state && <span className="text-gray-600 font-mono text-[10px]">({trail.state})</span>}
                </h3>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest border ${
                  trail.difficulty === 'easy' ? 'bg-green-900/30 text-green-500 border-green-500/20' :
                  trail.difficulty === 'moderate' ? 'bg-amber-900/30 text-amber-500 border-amber-500/20' :
                  trail.difficulty === 'hard' ? 'bg-orange-900/30 text-orange-500 border-orange-500/20' :
                  'bg-red-900/30 text-red-500 border-red-500/20'
                }`}>
                  {trail.difficulty}
                </span>
              </div>
              
              <div className="mt-4 mb-2 flex items-center justify-between text-[10px] uppercase font-bold tracking-widest text-gray-500">
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {trail.waypoints?.length || 0} Waypts/Obstacles</span>
                <span className={trail.visibility === 'private' ? 'text-red-500/70 border border-red-500/20 bg-red-900/10 px-1.5 py-0.5 rounded' : 'text-blue-500/70 border border-blue-500/20 bg-blue-900/10 px-1.5 py-0.5 rounded'}>
                  {trail.visibility === 'private' ? 'Private' : 'Public'}
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{trail.description}</p>
              
              <div className="mt-3 flex items-center gap-1">
                <span className="text-yellow-500 text-sm">★</span>
                <span className="text-xs font-mono text-gray-300">
                  {trail.ratingCount ? (trail.ratingTotal! / trail.ratingCount).toFixed(1) : 'No rating'}
                </span>
                <span className="text-[10px] text-gray-500 ml-1 font-mono">({trail.ratingCount || 0})</span>
                
                {user && (
                  <div className="ml-auto flex items-center gap-1 group/rating">
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

              {user && (trail.creatorId === user.uid || role === 'advanced') && (
                <div className="mt-4 flex gap-2">
                  <button 
                    onClick={() => {
                      setTrailName(trail.name);
                      setTrailDesc(trail.description);
                      setTrailDiff(trail.difficulty);
                      setTrailLat(trail.lat);
                      setTrailLng(trail.lng);
                      setTrailState(trail.state || '');
                      setTrailPattern(trail.pattern || 'through');
                      setTrailVisibility(trail.visibility || 'public');
                      setEditingTrailId(trail.id);
                      setShowAddTrail(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-[10px] uppercase font-bold text-gray-500 hover:text-orange-500 transition-colors"
                  >
                    Edit Trail 
                  </button>
                  <button 
                    onClick={async (e) => {
                      e.stopPropagation();
                      setConfirmDialog({
                        message: "Are you sure you want to delete this trail?",
                        onConfirm: async () => {
                          setConfirmDialog(null);
                          try {
                            await deleteTrail(trail.id);
                          } catch (err) {
                             alert("Failed to delete trail: " + (err as Error).message);
                          }
                        }
                      });
                    }}
                    className="text-[10px] uppercase font-bold text-gray-500 hover:text-red-500 transition-colors ml-auto"
                    type="button"
                  >
                    Delete 
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}


