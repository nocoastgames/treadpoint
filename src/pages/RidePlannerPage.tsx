import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useRides } from '../hooks/useRides';
import { useTrails, Trail } from '../hooks/useTrails';
import { useReports } from '../hooks/useReports';
import { useAuth } from '../contexts/AuthContext';
import { useUsers } from '../hooks/useUsers';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, collection, onSnapshot, addDoc, updateDoc, query, orderBy, setDoc } from 'firebase/firestore';
import { Map, AdvancedMarker, MapMouseEvent, Polyline, useMap, InfoWindow, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Calendar as CalendarIcon, Users, MapPin, Mail, Check, X, Navigation, AlertTriangle, ImageIcon, Edit3, Layers, Maximize, Minimize } from 'lucide-react';
import { format } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { identifyTrailFromWaypoints } from '../lib/gemini';

interface Invite {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined';
  invitedById: string;
}

interface Availability {
  userId: string;
  dates: string[];
}

export default function RidePlannerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { rides, updateRide, deleteRide } = useRides();
  const { trails, updateTrail } = useTrails();
  const { user, role } = useAuth();
  
  const ride = rides.find(r => r.id === id);
  const trail = trails.find(t => t.id === ride?.trailId);
  const { reports, addReport } = useReports(trail?.id);

  const [invites, setInvites] = useState<Invite[]>([]);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  
  const [participants, setParticipants] = useState<import('../hooks/useRides').RideParticipant[]>([]);
  const { users, giveKarma } = useUsers();
  
  // Potential dates to poll for
  const [pollDate, setPollDate] = useState<Date | null>(null);
  
  // Route Builder state
  const [routeBuilderMode, setRouteBuilderMode] = useState(false);
  const [routeWaypoints, setRouteWaypoints] = useState<import('../hooks/useTrails').TrailWaypoint[]>([]);
  const [routeBuilderSegmentType, setRouteBuilderSegmentType] = useState<'main' | 'bypass' | 'leg'>('main');
  const [routeBuilderPointType, setRouteBuilderPointType] = useState<'waypoint' | 'start' | 'end' | 'obstacle' | 'scenic' | 'meetup'>('waypoint');
  const [routeBuilderSegmentId, setRouteBuilderSegmentId] = useState('main-1');
  const [snapToRoad, setSnapToRoad] = useState(true);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const routesLib = useMapsLibrary('routes');
  
  const [selectedWaypoint, setSelectedWaypoint] = useState<{
    list: 'saved' | 'route';
    index: number;
    waypoint: import('../hooks/useTrails').TrailWaypoint;
  } | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void } | null>(null);
  
  // Reporting state
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportLat, setReportLat] = useState<number | null>(null);
  const [reportLng, setReportLng] = useState<number | null>(null);
  const [reportType, setReportType] = useState<'hazard' | 'condition' | 'waypoint' | 'scenic'>('waypoint');
  const [reportDesc, setReportDesc] = useState('');

  // Editing state
  const [isEditingRide, setIsEditingRide] = useState(false);
  const [editRideTitle, setEditRideTitle] = useState('');
  const [editRideDate, setEditRideDate] = useState<Date | null>(null);
  const [editRideStatus, setEditRideStatus] = useState<'planned'|'active'|'completed'|'cancelled'>('planned');

  // Map state
  const [mapTypeId, setMapTypeId] = useState<'terrain' | 'satellite' | 'hybrid' | 'roadmap'>('terrain');
  
  const map = useMap('RIDE_PLANNER_MAP');
  const [hasCentered, setHasCentered] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  useEffect(() => {
    if (trail && map && !hasCentered) {
      map.panTo({ lat: trail.lat, lng: trail.lng });
      // Zoom in a bit if it was at default zoom
      if (map.getZoom() && map.getZoom()! < 10) {
        map.setZoom(14);
      }
      setHasCentered(true);
    }
  }, [trail, map, hasCentered]);

  useEffect(() => {
    if (!id || !user) return;
    
    // Subscribe to invites
    const invitesUnsub = onSnapshot(collection(db, `rides/${id}/invites`), (snapshot) => {
      setInvites(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Invite[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `rides/${id}/invites`));

    // Subscribe to availabilities
    const availUnsub = onSnapshot(collection(db, `rides/${id}/availabilities`), (snapshot) => {
      setAvailabilities(snapshot.docs.map(doc => ({ userId: doc.id, ...doc.data() })) as Availability[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `rides/${id}/availabilities`));

    // Subscribe to participants
    const partsUnsub = onSnapshot(collection(db, `rides/${id}/participants`), (snapshot) => {
      setParticipants(snapshot.docs.map(doc => ({ ...doc.data() } as import('../hooks/useRides').RideParticipant)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `rides/${id}/participants`));

    return () => {
      invitesUnsub();
      availUnsub();
      partsUnsub();
    };
  }, [id, user]);

  useEffect(() => {
    if (user) {
      const myAvail = availabilities.find(a => a.userId === user.uid);
      if (myAvail) setSelectedDates(myAvail.dates);
    }
  }, [availabilities, user]);

  // Auto Save
  useEffect(() => {
    if (routeBuilderMode && trail && routeWaypoints.length > 0) {
      const timer = setTimeout(() => {
        updateTrail(trail.id, { waypoints: routeWaypoints });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [routeWaypoints, routeBuilderMode, trail?.id]);

  if (!ride) {
    return <div className="p-8 text-center text-gray-400">Loading ride details...</div>;
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id) return;
    try {
      await addDoc(collection(db, `rides/${id}/invites`), {
        email: newInviteEmail,
        status: 'pending',
        invitedById: user.uid
      });
      setNewInviteEmail('');
    } catch (e) {
      console.error(e);
      alert('Failed to send invite');
    }
  };

  const toggleAvailability = async (dateStr: string) => {
    if (!user || !id) return;
    let newDates = [...selectedDates];
    if (newDates.includes(dateStr)) {
      newDates = newDates.filter(d => d !== dateStr);
    } else {
      newDates.push(dateStr);
    }
    setSelectedDates(newDates);

    try {
      await setDoc(doc(db, `rides/${id}/availabilities`, user.uid), {
        userId: user.uid,
        dates: newDates
      });
    } catch (e) {
      console.error(e);
    }
  };

  const clearAllRouteData = async () => {
    if (!trail || !user) return;
    setConfirmDialog({
      message: "Are you sure you want to clear all waypoints and condition reports for this trail?",
      onConfirm: async () => {
        setConfirmDialog(null);
        // Delete reports sequentially using our db ref
        for (const report of reports) {
          if (report.id) {
            try {
              await import('firebase/firestore').then(({ deleteDoc }) => deleteDoc(doc(db, 'reports', report.id)));
            } catch (error) {
              console.error("Error deleting report", error);
            }
          }
        }

        // Clear waypoints
        await updateTrail(trail.id, { waypoints: [] });
        setRouteWaypoints([]);
        setSelectedWaypoint(null);
      }
    });
  };

  const center = trail ? { lat: trail.lat, lng: trail.lng } : { lat: 39.8283, lng: -98.5795 };
  
  const approveParticipant = async (userId: string) => {
    if (!id || !user || user.uid !== ride?.organizerId) return;
    try {
      await updateDoc(doc(db, `rides/${id}/participants`, userId), { status: 'approved' });
    } catch (e) {
      console.error(e);
    }
  };

  const allProposedDates = Array.from(new Set([
    ...(ride.dateType === 'fixed' ? [format(new Date(ride.date), "yyyy-MM-dd")] : []),
    ...(ride.dateOptions ? ride.dateOptions.map(d => format(new Date(d), "yyyy-MM-dd")) : []),
    ...availabilities.flatMap(a => a.dates)
  ])).sort();

  const handleAddPollDate = (e: React.FormEvent) => {
    e.preventDefault();
    if (pollDate) {
      toggleAvailability(format(pollDate, "yyyy-MM-dd"));
      setPollDate(null);
    }
  };
  
  const onMapClick = async (e: MapMouseEvent) => {
    if (e.detail.latLng) {
      if (routeBuilderMode) {
        const newWaypoint: import('../hooks/useTrails').TrailWaypoint = { 
          lat: e.detail.latLng.lat, 
          lng: e.detail.latLng.lng, 
          type: routeBuilderPointType,
          segmentType: routeBuilderSegmentType,
          segmentId: routeBuilderSegmentId
        };
        
        let pathNodes: import('../hooks/useTrails').TrailWaypoint[] = [];
        if (snapToRoad && routesLib) {
          // Since findLastIndex is not broadly supported in some older environments, let's just loop backwards
          let lastIndex = -1;
          for (let i = routeWaypoints.length - 1; i >= 0; i--) {
            if (routeWaypoints[i].segmentId === routeBuilderSegmentId && !routeWaypoints[i].isPathNode) {
              lastIndex = i;
              break;
            }
          }
          if (lastIndex !== -1) {
            const origin = routeWaypoints[lastIndex];
            try {
              const directionsService = new routesLib.DirectionsService();
              const result = await directionsService.route({
                origin: { lat: origin.lat, lng: origin.lng },
                destination: { lat: newWaypoint.lat, lng: newWaypoint.lng },
                travelMode: 'DRIVING' as any
              });
              if (result.routes && result.routes.length > 0) {
                const overviewPath = result.routes[0].overview_path;
                overviewPath.forEach((ll: any) => {
                  pathNodes.push({
                    lat: ll.lat(),
                    lng: ll.lng(),
                    segmentId: routeBuilderSegmentId,
                    segmentType: routeBuilderSegmentType,
                    isPathNode: true
                  });
                });
              }
            } catch (error) {
              console.error("Error computing route", error);
            }
          }
        }
        setRouteWaypoints(prev => [...prev, ...pathNodes, newWaypoint]);
      } else {
        setReportLat(e.detail.latLng.lat);
        setReportLng(e.detail.latLng.lng);
        setShowReportForm(true);
      }
    }
  };

  const handleUseAIToIdentifyTrail = async () => {
    if (!trail || routeWaypoints.length < 2) return;
    setIsIdentifying(true);
    try {
      const match = await identifyTrailFromWaypoints(routeWaypoints);
      await updateTrail(trail.id, {
        name: match.name,
        description: match.description,
        difficulty: match.difficulty,
        waypoints: routeWaypoints
      });
      alert(`Trail updated! AI identified it as: ${match.name}`);
      setRouteBuilderMode(false);
      setRouteWaypoints([]);
    } catch (e) {
      console.error(e);
      alert('Failed to identify trail.');
    } finally {
      setIsIdentifying(false);
    }
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trail || !reportLat || !reportLng) return;
    try {
      await addReport({
        trailId: trail.id,
        type: reportType,
        description: reportDesc,
        lat: reportLat,
        lng: reportLng
      });
      setShowReportForm(false);
      setReportDesc('');
      setReportType('waypoint');
      setReportLat(null);
      setReportLng(null);
    } catch (err) {
      console.error(err);
      alert('Failed to drop pin');
    }
  };

  const handleUpdateRide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await updateRide(id, {
        title: editRideTitle,
        date: editRideDate ? editRideDate.toISOString() : ride.date,
        dateType: editRideDate ? 'fixed' : ride.dateType,
        status: editRideStatus
      });
      setIsEditingRide(false);
    } catch (err) {
      console.error(err);
      alert('Failed to update ride');
    }
  };

  const renderTrailLines = (waypoints: import('../hooks/useTrails').TrailWaypoint[] | undefined) => {
    if (!waypoints || waypoints.length === 0) return null;
    
    // Group waypoints by segmentId, excluding meetup points
    const grouped = waypoints.filter(wp => wp.type !== 'meetup').reduce((acc, wp) => {
      const segId = wp.segmentId || 'main-1';
      if (!acc[segId]) acc[segId] = [];
      acc[segId].push(wp);
      return acc;
    }, {} as Record<string, import('../hooks/useTrails').TrailWaypoint[]>);

    return Object.entries(grouped).map(([segId, pts]) => {
      if (pts.length < 2) return null;
      const isMain = pts[0].segmentType === 'main';
      const color = isMain ? '#ef4444' : '#22c55e'; // Red for main, green for bypass/leg
      return (
        <Polyline key={segId} path={pts.map(p => ({ lat: p.lat, lng: p.lng }))} strokeColor={color} strokeWeight={4} strokeOpacity={0.8} />
      );
    });
  };

  const renderTrailMarkers = (waypoints: import('../hooks/useTrails').TrailWaypoint[] | undefined, prefix: 'saved' | 'route') => {
    if (!waypoints) return null;
    return waypoints.map((wp, i) => {
      if (wp.isPathNode) return null;

      const isMain = wp.segmentType === 'main';
      let bgColor = isMain ? 'bg-red-500' : 'bg-green-500';
      
      // Override colors by point type
      if (wp.type === 'start') bgColor = 'bg-blue-500 text-white';
      if (wp.type === 'meetup') bgColor = 'bg-cyan-400 text-black';
      if (wp.type === 'end') bgColor = 'bg-black text-white';
      if (wp.type === 'obstacle') bgColor = 'bg-yellow-500';
      if (wp.type === 'scenic') bgColor = 'bg-purple-500';

      const isDraggable = prefix === 'route' && routeBuilderMode;

      return (
        <AdvancedMarker 
          key={`${prefix}-${i}`} 
          position={{ lat: wp.lat, lng: wp.lng }}
          onClick={() => setSelectedWaypoint({ list: prefix, index: i, waypoint: wp })}
          draggable={isDraggable}
          onDragEnd={(e) => {
            if (isDraggable && e.latLng) {
              const newWaypoints = [...routeWaypoints];
              
              let startIdx = i;
              while(startIdx > 0 && newWaypoints[startIdx - 1]?.isPathNode) {
                  startIdx--;
              }
              let endIdx = i;
              while(endIdx < newWaypoints.length - 1 && newWaypoints[endIdx + 1]?.isPathNode) {
                  endIdx++;
              }
              
              const countToRemoveBefore = i - startIdx;
              const countToRemoveAfter = endIdx - i;
              
              newWaypoints[i] = { ...newWaypoints[i], lat: e.latLng.lat(), lng: e.latLng.lng() };
              
              if (countToRemoveAfter > 0) {
                  newWaypoints.splice(i + 1, countToRemoveAfter);
              }
              if (countToRemoveBefore > 0) {
                  newWaypoints.splice(startIdx, countToRemoveBefore);
              }
              
              setRouteWaypoints(newWaypoints);
            }
          }}
        >
          <div className={`w-3 h-3 rounded-full border-2 border-white shadow-lg cursor-pointer hover:scale-125 transition-transform ${bgColor}`} title={`${wp.type} (${wp.segmentType})`} />
        </AdvancedMarker>
      )
    });
  };

  const activeWaypoints = routeBuilderMode ? routeWaypoints : trail?.waypoints || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-[#1C2025] p-6 rounded border border-gray-800 shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-100 mb-4">{confirmDialog.message}</h3>
            <div className="flex gap-3 justify-end mt-8">
              <button 
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded text-gray-400 hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 rounded bg-orange-500 hover:bg-orange-600 text-black font-bold transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Map & Trails */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-[#1C2025] p-6 rounded border border-gray-800">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-100">{ride.title}</h1>
              <p className="text-gray-400 flex items-center gap-2 mt-2 font-mono">
                <MapPin className="w-4 h-4 text-orange-500" /> {trail?.name || 'Searching for trail...'}
              </p>
              <p className="text-gray-400 flex items-center gap-2 mt-1 font-mono text-sm">
                <CalendarIcon className="w-4 h-4 text-orange-500" />
                {ride.dateType === 'poll' ? 'Date Poll Active' : format(new Date(ride.date), "PPP 'at' p")}
              </p>
            </div>
            {(user?.uid === ride.organizerId || ride.coOrganizerIds?.includes(user?.uid || '')) && !isEditingRide && (
              <div className="flex gap-1">
                <button 
                  onClick={() => {
                    setEditRideTitle(ride.title);
                    setEditRideDate(ride.dateType === 'poll' ? null : new Date(ride.date));
                    setEditRideStatus(ride.status);
                    setIsEditingRide(true);
                  }}
                  className="text-gray-400 hover:text-orange-500 p-2 rounded transition-colors"
                  title="Edit Ride"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button 
                  onClick={async () => {
                    setConfirmDialog({
                      message: 'Are you sure you want to delete this ride?',
                      onConfirm: async () => {
                        setConfirmDialog(null);
                        try {
                          await deleteRide(ride.id);
                          navigate('/');
                        } catch (err) {
                          alert("Error deleting ride: " + (err as Error).message);
                        }
                      }
                    });
                  }}
                  className="text-gray-400 hover:text-red-500 p-2 rounded transition-colors"
                  title="Delete Ride"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          
          {isEditingRide ? (
            <form onSubmit={handleUpdateRide} className="mt-4 flex flex-col gap-3 bg-[#0F1113] p-4 rounded border border-gray-800">
              <input 
                type="text" 
                value={editRideTitle} 
                onChange={(e) => setEditRideTitle(e.target.value)} 
                className="p-2 bg-[#1C2025] border border-gray-700 rounded text-sm text-gray-200 outline-none" 
                placeholder="Ride Title"
              />
              <DatePicker
                selected={editRideDate}
                onChange={(date) => setEditRideDate(date as Date)}
                showTimeSelect
                dateFormat="Pp"
                placeholderText="Select Date & Time"
                className="p-2 bg-[#1C2025] border border-gray-700 rounded text-sm text-gray-200 outline-none w-full"
                wrapperClassName="w-full"
              />
              <select 
                value={editRideStatus} 
                onChange={(e) => setEditRideStatus(e.target.value as any)} 
                className="p-2 bg-[#1C2025] border border-gray-700 rounded text-sm text-gray-200 outline-none"
              >
                <option value="planned">Planned</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <div className="flex gap-2 justify-end mt-2">
                <button type="button" onClick={() => setIsEditingRide(false)} className="text-[10px] uppercase font-bold text-gray-400 px-3 py-1">Cancel</button>
                <button type="submit" className="text-[10px] uppercase font-bold bg-orange-500 text-black px-4 py-2 rounded">Save</button>
              </div>
            </form>
          ) : (
            <div className="mt-4 flex gap-4">
              <span className="px-3 py-1 bg-gray-800 text-gray-300 rounded text-[10px] uppercase font-bold tracking-widest border border-gray-700">
                {ride.status}
              </span>
            </div>
          )}
        </div>

        <div className={isMapExpanded ? "fixed inset-0 z-50 bg-[#0B0D0E] flex flex-col" : "h-[500px] bg-[#0B0D0E] border border-gray-800 rounded relative overflow-hidden"}>
          <Map defaultZoom={4} defaultCenter={{ lat: 39.8283, lng: -98.5795 }} mapId="RIDE_PLANNER_MAP" mapTypeId={mapTypeId} disableDefaultUI={false} gestureHandling={'greedy'} onClick={onMapClick} className={isMapExpanded ? "flex-1" : ""}>
            {trail && (
              <AdvancedMarker position={{ lat: trail.lat, lng: trail.lng }}>
                <div className="w-6 h-6 bg-orange-500 rounded flex items-center justify-center border-2 border-white shadow-xl">
                  <Navigation className="w-3 h-3 text-white" />
                </div>
              </AdvancedMarker>
            )}
            
            {renderTrailLines(activeWaypoints)}
            {renderTrailMarkers(activeWaypoints, routeBuilderMode ? 'route' : 'saved')}
            
            {selectedWaypoint && (user?.uid === trail?.creatorId || user?.uid === ride.organizerId || routeBuilderMode) && (
              <InfoWindow
                position={{ lat: selectedWaypoint.waypoint.lat, lng: selectedWaypoint.waypoint.lng }}
                onCloseClick={() => setSelectedWaypoint(null)}
              >
                <div className="p-2 min-w-[200px] text-black">
                  <h4 className="font-bold text-sm mb-2">Edit Waypoint</h4>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider">Type</label>
                      <select 
                        value={selectedWaypoint.waypoint.type || 'waypoint'}
                        onChange={(e) => {
                          const updated = { ...selectedWaypoint.waypoint, type: e.target.value as any };
                          setSelectedWaypoint({ ...selectedWaypoint, waypoint: updated });
                        }}
                        className="w-full border border-gray-300 rounded p-1 text-sm bg-white outline-none"
                      >
                        <option value="start">Start</option>
                        <option value="meetup">Meetup</option>
                        <option value="end">End</option>
                        <option value="waypoint">Waypoint</option>
                        <option value="obstacle">Obstacle</option>
                        <option value="scenic">Scenic</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider">Segment Type</label>
                      <select 
                        value={selectedWaypoint.waypoint.segmentType || 'main'}
                        onChange={(e) => {
                          const updated = { ...selectedWaypoint.waypoint, segmentType: e.target.value as any };
                          setSelectedWaypoint({ ...selectedWaypoint, waypoint: updated });
                        }}
                        className="w-full border border-gray-300 rounded p-1 text-sm bg-white outline-none"
                      >
                        <option value="main">Main Route</option>
                        <option value="bypass">Bypass</option>
                        <option value="leg">Leg</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider">Segment ID</label>
                      <input 
                        type="text"
                        value={selectedWaypoint.waypoint.segmentId || ''}
                        onChange={(e) => {
                          const updated = { ...selectedWaypoint.waypoint, segmentId: e.target.value };
                          setSelectedWaypoint({ ...selectedWaypoint, waypoint: updated });
                        }}
                        className="w-full border border-gray-300 rounded p-1 text-sm bg-white outline-none"
                      />
                    </div>
                    <div className="flex gap-2 mt-4 pt-2 border-t border-gray-200">
                      <button 
                        onClick={() => {
                          if (selectedWaypoint.list === 'saved' && trail) {
                            const newWaypoints = [...(trail.waypoints || [])];
                            newWaypoints[selectedWaypoint.index] = selectedWaypoint.waypoint;
                            updateTrail(trail.id, { waypoints: newWaypoints });
                          } else if (selectedWaypoint.list === 'route') {
                            const newWaypoints = [...routeWaypoints];
                            newWaypoints[selectedWaypoint.index] = selectedWaypoint.waypoint;
                            setRouteWaypoints(newWaypoints);
                          }
                          setSelectedWaypoint(null);
                        }}
                        className="flex-1 bg-black text-white text-[10px] uppercase font-bold tracking-widest py-1.5 rounded hover:bg-gray-800"
                      >
                        Save
                      </button>
                      <button 
                        onClick={() => {
                          const listType = selectedWaypoint.list;
                          const wpts = listType === 'saved' && trail ? [...(trail.waypoints || [])] : [...routeWaypoints];
                          
                          let startIdx = selectedWaypoint.index;
                          while(startIdx > 0 && wpts[startIdx - 1]?.isPathNode) {
                              startIdx--;
                          }
                          let endIdx = selectedWaypoint.index;
                          while(endIdx < wpts.length - 1 && wpts[endIdx + 1]?.isPathNode) {
                              endIdx++;
                          }

                          wpts.splice(startIdx, endIdx - startIdx + 1);

                          if (listType === 'saved' && trail) {
                            updateTrail(trail.id, { waypoints: wpts });
                          } else if (listType === 'route') {
                            setRouteWaypoints(wpts);
                          }
                          
                          setSelectedWaypoint(null);
                        }}
                        className="flex-1 bg-red-600 text-white text-[10px] uppercase font-bold tracking-widest py-1.5 rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </InfoWindow>
            )}

            {reports.map((report) => (
              <AdvancedMarker key={report.id} position={{ lat: report.lat, lng: report.lng }}>
                <div className={`p-1.5 rounded-full shadow-lg border-2 border-white ${
                  report.type === 'hazard' ? 'bg-red-500' :
                  report.type === 'condition' ? 'bg-orange-500' :
                  report.type === 'scenic' ? 'bg-blue-500' : 'bg-green-500'
                }`}>
                  {report.type === 'hazard' ? <AlertTriangle className="w-4 h-4 text-white" /> :
                   report.type === 'condition' ? <Navigation className="w-4 h-4 text-white" /> :
                   report.type === 'scenic' ? <ImageIcon className="w-4 h-4 text-white" /> :
                   <MapPin className="w-4 h-4 text-white" />}
                </div>
              </AdvancedMarker>
            ))}
            
            {showReportForm && reportLat && reportLng && (
              <AdvancedMarker position={{ lat: reportLat, lng: reportLng }}>
                <div className="w-4 h-4 bg-yellow-400 border-2 border-white rounded-full animate-bounce shadow-xl" />
              </AdvancedMarker>
            )}
          </Map>
          <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-40">
            <div className="bg-[#16191D]/90 backdrop-blur p-4 rounded border border-gray-700 w-72">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Interactive Map</h3>
                <button
                  onClick={() => setIsMapExpanded(!isMapExpanded)}
                  className="text-[10px] text-orange-500 hover:text-orange-400 uppercase font-bold tracking-widest flex items-center gap-1"
                  title={isMapExpanded ? "Restore map" : "Expand map"}
                >
                  {isMapExpanded ? <Minimize className="w-3 h-3" /> : <Maximize className="w-3 h-3" />}
                  {isMapExpanded ? 'Restore' : 'Expand'}
                </button>
              </div>
              <div className="flex bg-[#1C2025] rounded border border-gray-700 overflow-hidden mb-2">
                <button onClick={() => setMapTypeId('terrain')} className={`flex-1 py-1 text-[10px] uppercase font-bold tracking-widest transition-colors ${mapTypeId === 'terrain' ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`}>Terrain</button>
                <button onClick={() => setMapTypeId('satellite')} className={`flex-1 py-1 text-[10px] uppercase font-bold tracking-widest transition-colors border-l border-r border-gray-700 ${mapTypeId === 'satellite' ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`}>Satellite</button>
                <button onClick={() => setMapTypeId('hybrid')} className={`flex-1 py-1 text-[10px] uppercase font-bold tracking-widest transition-colors ${mapTypeId === 'hybrid' ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`}>Hybrid</button>
              </div>
              <p className="text-xs text-gray-500 mb-4">View the selected trail and any reported waypoints. Click the map to drop a new pin.</p>
              {user?.uid === ride.organizerId && (
                <p className="text-[10px] text-orange-500 font-bold uppercase tracking-wider">You are the organizer</p>
              )}
            </div>
          </div>

          <div className="absolute top-4 right-4 flex flex-col gap-2 z-40">
            {isMapExpanded && (
              <button
                onClick={() => setIsMapExpanded(false)}
                className="px-4 py-2 text-[10px] uppercase font-bold tracking-widest rounded transition-colors bg-[#1C2025] text-gray-300 border border-gray-700 hover:border-gray-500 mb-2 flex items-center justify-center gap-2"
              >
                <Minimize className="w-3 h-3" />
                Restore Map
              </button>
            )}
            <button 
              onClick={() => {
                if (!routeBuilderMode) {
                  setRouteWaypoints(trail?.waypoints || []);
                }
                setRouteBuilderMode(!routeBuilderMode);
              }}
              className={`px-4 py-2 text-[10px] uppercase font-bold tracking-widest rounded transition-colors border ${routeBuilderMode ? 'bg-orange-500 text-black border-transparent hover:bg-orange-600' : 'bg-[#1C2025] text-gray-300 border-gray-700 hover:border-gray-500'}`}
            >
              {routeBuilderMode ? 'Done Building' : 'Build Route'}
            </button>
            {routeBuilderMode && (
              <button 
                onClick={() => setRouteWaypoints([])}
                className="px-4 py-2 text-[10px] uppercase font-bold tracking-widest rounded transition-colors bg-red-900/50 text-red-400 border border-red-900 hover:bg-red-900/80"
              >
                Clear Route
              </button>
            )}
          </div>

          {routeBuilderMode && (
            <div className="absolute top-4 left-4 bg-[#16191D]/90 backdrop-blur p-4 rounded border border-gray-700 w-80 z-40 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Build Route</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={snapToRoad} onChange={e => setSnapToRoad(e.target.checked)} className="accent-orange-500" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Snap</span>
                </label>
              </div>
              
              <div className="flex gap-2">
                <select 
                  value={routeBuilderSegmentType}
                  onChange={(e) => setRouteBuilderSegmentType(e.target.value as any)}
                  className="flex-1 bg-[#0F1113] border border-gray-700 text-gray-200 text-xs px-2 py-1.5 rounded outline-none"
                >
                  <option value="main">Main Route</option>
                  <option value="bypass">Bypass</option>
                  <option value="leg">Leg</option>
                </select>
                <input 
                  type="text" 
                  value={routeBuilderSegmentId}
                  onChange={(e) => setRouteBuilderSegmentId(e.target.value)}
                  placeholder="Segment ID (e.g. main-1)"
                  className="flex-1 bg-[#0F1113] border border-gray-700 text-gray-200 text-xs px-2 py-1.5 rounded outline-none w-24"
                />
              </div>

              <div className="grid grid-cols-3 gap-1">
                {['start', 'meetup', 'end', 'waypoint', 'obstacle', 'scenic'].map(type => (
                  <button
                    key={type}
                    onClick={() => setRouteBuilderPointType(type as any)}
                    className={`col-span-1 py-1 text-[10px] uppercase font-bold rounded ${routeBuilderPointType === type ? 'bg-orange-500 text-black' : 'bg-gray-800 text-gray-400'}`}
                  >{type}</button>
                ))}
              </div>

              <p className="text-xs text-gray-500">{routeWaypoints.length} waypoints dropped. Saved automatically.</p>
              
              <button 
                onClick={handleUseAIToIdentifyTrail}
                disabled={isIdentifying || routeWaypoints.length < 2}
                className="w-full py-2 bg-[#1C2025] hover:bg-orange-500/10 border border-gray-700 hover:border-orange-500/50 text-orange-500 rounded text-[10px] uppercase font-bold tracking-widest transition-colors disabled:opacity-50"
              >
                {isIdentifying ? 'Identifying...' : 'Identify Base Trail'}
              </button>
            </div>
          )}
          
          {showReportForm && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#16191D]/95 p-6 rounded border border-gray-700 w-full max-w-sm z-50 shadow-2xl backdrop-blur-md">
              <h3 className="text-[10px] font-bold uppercase text-gray-500 mb-4 tracking-widest">Drop Pin</h3>
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
            </div>
          )}
        </div>
      </div>
      
      {/* Sidebar: Invites & Availability */}
      <div className="space-y-6">
        {/* Availability */}
        <div className="bg-[#1C2025] p-6 rounded border border-gray-800">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-orange-500" /> Availability Poll
          </h2>
          
          <div className="space-y-3 mb-6">
            {allProposedDates.map(dateStr => {
              const availableUsersCount = availabilities.filter(a => a.dates.includes(dateStr)).length;
              const iAmAvailable = selectedDates.includes(dateStr);
              return (
                <div key={dateStr} className="flex justify-between items-center bg-[#0F1113] p-3 rounded border border-gray-800">
                  <span className="text-sm text-gray-300 font-mono">{format(new Date(dateStr), 'MMM d, yyyy')}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500">{availableUsersCount} available</span>
                    {ride.dateType === 'poll' && user?.uid === ride.organizerId && (
                      <button 
                        onClick={async () => {
                          if (window.confirm(`Finalize ride for ${format(new Date(dateStr), 'MMM d, yyyy')}?`)) {
                            await updateRide(ride.id, { date: new Date(dateStr).toISOString(), dateType: 'fixed', dateOptions: [] });
                          }
                        }}
                        className="px-2 py-1 bg-blue-900/40 hover:bg-blue-900/60 text-blue-400 border border-blue-900/50 rounded text-[9px] uppercase font-bold tracking-widest transition-colors"
                      >
                        Finalize
                      </button>
                    )}
                    <button 
                      onClick={() => toggleAvailability(dateStr)}
                      className={`w-6 h-6 rounded flex items-center justify-center border transition-colors ${
                        iAmAvailable ? 'bg-orange-500 border-orange-500 text-black' : 'border-gray-600 hover:border-gray-400 text-transparent'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleAddPollDate} className="flex gap-2">
            <DatePicker
              selected={pollDate}
              onChange={(date) => setPollDate(date as Date)}
              dateFormat="yyyy-MM-dd"
              placeholderText="Select Poll Date"
              className="flex-1 p-2 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm focus:border-gray-600 outline-none w-full"
              wrapperClassName="flex-1"
            />
            <button type="submit" className="bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-2 rounded text-[10px] uppercase font-bold tracking-widest transition-colors border border-gray-700">
              Add Date
            </button>
          </form>
        </div>

        {/* Participants */}
        <div className="bg-[#1C2025] p-6 rounded border border-gray-800">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-orange-500" /> Participants
          </h2>

          {participants.length === 0 ? (
            <p className="text-gray-500 text-sm font-mono tracking-tighter">No participants yet.</p>
          ) : (
            <div className="space-y-2">
              {participants.map(p => {
                const u = users.find(user => user.id === p.userId);
                return (
                  <div key={p.userId} className="flex justify-between items-center text-sm p-3 bg-[#0F1113] rounded border border-gray-800">
                    <div>
                      <span className="text-gray-200 font-mono block">{u?.email || 'Unknown User'}</span>
                      <div className="flex items-center gap-2 mt-1 -mb-1">
                        <span className={`text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded border ${
                          p.status === 'approved' ? 'bg-green-900/30 text-green-500 border-green-500/20' :
                          'bg-amber-900/30 text-amber-500 border-amber-500/20'
                        }`}>
                          {p.status}
                        </span>
                        <span className="text-[9px] uppercase tracking-widest font-bold text-gray-500">Trail Cred: {u?.karma || 0}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {user && role === 'advanced' && user.uid !== p.userId && (
                        <button 
                          onClick={() => giveKarma(p.userId)}
                          className="w-6 h-6 flex items-center justify-center rounded border border-gray-700 bg-[#1C2025] hover:border-orange-500 hover:text-orange-500 text-gray-500 transition-colors"
                          title="Give Trail Cred"
                        >
                          +
                        </button>
                      )}
                      
                      {user?.uid === ride.organizerId && p.status === 'pending' && (
                        <button
                          onClick={() => approveParticipant(p.userId)}
                          className="bg-orange-500 text-black text-[9px] uppercase tracking-widest font-bold px-2 py-1 rounded hover:bg-orange-600 transition-colors"
                        >
                          Approve
                        </button>
                      )}

                      {user?.uid === ride.organizerId && p.status === 'approved' && p.userId !== ride.organizerId && !ride.coOrganizerIds?.includes(p.userId) && (
                        <button
                          onClick={async () => {
                            setConfirmDialog({
                              message: "Make this user a co-owner?",
                              onConfirm: async () => {
                                setConfirmDialog(null);
                                const newCoIds = [...(ride.coOrganizerIds || []), p.userId];
                                await updateRide(ride.id, { coOrganizerIds: newCoIds });
                              }
                            });
                          }}
                          className="bg-blue-900/30 text-blue-500 text-[9px] uppercase tracking-widest font-bold px-2 py-1 rounded hover:bg-blue-900/50 transition-colors"
                        >
                          Make Co-Owner
                        </button>
                      )}
                      {ride.coOrganizerIds?.includes(p.userId) && (
                         <span className="text-[9px] uppercase tracking-widest font-bold text-blue-500 px-2 py-1">Co-Owner</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Invites */}
        <div className="bg-[#1C2025] p-6 rounded border border-gray-800">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-orange-500" /> Invites
          </h2>

          <form onSubmit={handleInvite} className="flex gap-2 mb-6">
            <input 
              type="email"
              required
              placeholder="Email address"
              value={newInviteEmail}
              onChange={e => setNewInviteEmail(e.target.value)}
              className="flex-1 p-2 bg-[#0F1113] border border-gray-800 text-gray-200 rounded text-sm placeholder:text-gray-600 focus:border-gray-600 outline-none"
            />
            <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-black px-3 py-2 rounded text-[10px] uppercase font-bold tracking-widest transition-colors">
              Invite
            </button>
          </form>

          {invites.length === 0 ? (
            <p className="text-gray-500 text-sm font-mono tracking-tighter">No invites sent yet.</p>
          ) : (
            <div className="space-y-2">
              {invites.map(invite => (
                <div key={invite.id} className="flex justify-between items-center text-sm p-2 bg-[#0F1113] rounded border border-gray-800">
                  <span className="text-gray-300 font-mono truncate">{invite.email}</span>
                  <span className={`text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded border ${
                    invite.status === 'accepted' ? 'bg-green-900/30 text-green-500 border-green-500/20' :
                    invite.status === 'declined' ? 'bg-red-900/30 text-red-500 border-red-500/20' :
                    'bg-gray-800 text-gray-400 border-gray-700'
                  }`}>
                    {invite.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
