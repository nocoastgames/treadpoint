import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface TrailWaypoint {
  lat: number;
  lng: number;
  type?: 'start' | 'end' | 'obstacle' | 'scenic' | 'waypoint';
  segmentType?: 'main' | 'bypass' | 'leg';
  segmentId?: string;
}

export interface Trail {
  id: string;
  name: string;
  description: string;
  difficulty: 'easy' | 'moderate' | 'hard' | 'extreme';
  lat: number;
  lng: number;
  waypoints?: TrailWaypoint[];
  pattern?: 'through' | 'in_and_out';
  state?: string;
  visibility?: 'public' | 'private';
  ratingCount?: number;
  ratingTotal?: number;
  createdAt: string;
  creatorId: string;
}

export function useTrails() {
  const [trails, setTrails] = useState<Trail[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setTrails([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const q = query(collection(db, 'trails'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const results: Trail[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Trail[];
      setTrails(results);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trails');
    });

    return () => unsubscribe();
  }, [user]);

  const addTrail = async (trail: Omit<Trail, 'id' | 'createdAt'>) => {
    try {
      await addDoc(collection(db, 'trails'), {
        ...trail,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'trails');
    }
  }

  const updateTrail = async (id: string, updates: Partial<Pick<Trail, 'name' | 'description' | 'difficulty' | 'lat' | 'lng' | 'waypoints' | 'state' | 'pattern' | 'visibility' | 'ratingCount' | 'ratingTotal'>>) => {
    if (!auth.currentUser) throw new Error("Must be logged in");
    try {
      await updateDoc(doc(db, 'trails', id), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `trails/${id}`);
    }
  };

  const deleteTrail = async (id: string) => {
    if (!auth.currentUser) throw new Error("Must be logged in");
    try {
      await deleteDoc(doc(db, 'trails', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `trails/${id}`);
    }
  };

  return { trails, loading, addTrail, updateTrail, deleteTrail };
}
