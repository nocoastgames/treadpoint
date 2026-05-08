import { useState, useEffect, useRef } from 'react';

// Haversine formula
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);  
  const dLon = deg2rad(lon2 - lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI/180);
}

export function useLocation() {
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [distanceKm, setDistanceKm] = useState(0);
  const [speedMs, setSpeedMs] = useState(0);
  const [elevation, setElevation] = useState<number | null>(null);
  
  const prevLocRef = useRef<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const newLoc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        
        setLocation(newLoc);
        
        if (position.coords.speed) {
          setSpeedMs(position.coords.speed); // meters per second
        }
        
        if (position.coords.altitude) {
          setElevation(position.coords.altitude); // meters
        }
        
        if (prevLocRef.current) {
          const dist = getDistanceFromLatLonInKm(
            prevLocRef.current.lat, prevLocRef.current.lng,
            newLoc.lat, newLoc.lng
          );
          setDistanceKm(prev => prev + dist);
        }
        
        prevLocRef.current = newLoc;
        setError(null);
      },
      (err) => {
        setError(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { location, error, distanceKm, speedMs, elevation };
}
