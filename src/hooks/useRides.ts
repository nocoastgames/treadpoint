import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc, doc, deleteDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface Ride {
  id: string;
  trailId: string;
  organizerId: string;
  coOrganizerIds?: string[];
  title: string;
  date: string;
  dateType?: 'fixed' | 'poll';
  dateOptions?: string[];
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  visibility?: 'public' | 'private';
  createdAt: string;
}

export interface RideParticipant {
  userId: string;
  joinedAt: string;
  status: 'pending' | 'approved';
}

export function useRides() {
  const [rides, setRides] = useState<Ride[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setRides([]);
      return;
    }
    const q = query(collection(db, 'rides'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRides(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Ride[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'rides'));

    return () => unsubscribe();
  }, [user]);

  const addRide = async (ride: Omit<Ride, 'id' | 'createdAt' | 'organizerId'>) => {
    if (!auth.currentUser) throw new Error("Must be logged in.");
    try {
      const d = await addDoc(collection(db, 'rides'), {
        ...ride,
        organizerId: auth.currentUser.uid,
        createdAt: new Date().toISOString()
      });
      return d.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'rides');
      throw e;
    }
  };

  const updateRide = async (rideId: string, updates: Partial<Pick<Ride, 'title' | 'date' | 'status' | 'visibility' | 'coOrganizerIds' | 'dateType' | 'dateOptions'>>) => {
    if (!auth.currentUser) throw new Error("Must be logged in.");
    try {
      await updateDoc(doc(db, 'rides', rideId), updates);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `rides/${rideId}`);
      throw e;
    }
  };

  const deleteRide = async (rideId: string) => {
    if (!auth.currentUser) throw new Error("Must be logged in");
    try {
      await deleteDoc(doc(db, 'rides', rideId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rides/${rideId}`);
    }
  };

  const joinRide = async (rideId: string, isPrivate?: boolean) => {
    if (!auth.currentUser) throw new Error("Must be logged in.");
    try {
      const pRef = doc(db, 'rides', rideId, 'participants', auth.currentUser.uid);
      await setDoc(pRef, {
        userId: auth.currentUser.uid,
        joinedAt: new Date().toISOString(),
        status: isPrivate ? 'pending' : 'approved'
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `rides/${rideId}/participants`);
    }
  };

  return { rides, addRide, updateRide, joinRide, deleteRide };
}

