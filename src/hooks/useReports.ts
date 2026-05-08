import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc, doc, updateDoc, increment, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface Report {
  id: string;
  trailId: string;
  authorId: string;
  type: 'condition' | 'waypoint' | 'hazard' | 'scenic';
  description: string;
  lat: number;
  lng: number;
  upvotes: number;
  createdAt: string;
}

export function useReports(trailId?: string) {
  const [reports, setReports] = useState<Report[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setReports([]);
      return;
    }

    let q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let results: Report[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Report[];
      
      if (trailId) {
        results = results.filter(r => r.trailId === trailId);
      }
      
      setReports(results);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reports');
    });

    return () => unsubscribe();
  }, [trailId, user]);

  const addReport = async (report: Omit<Report, 'id' | 'createdAt' | 'upvotes' | 'authorId'>) => {
    if (!auth.currentUser) throw new Error("Must be logged in");
    try {
      await addDoc(collection(db, 'reports'), {
        ...report,
        authorId: auth.currentUser.uid,
        upvotes: 0,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'reports');
    }
  };

  const upvoteReport = async (reportId: string, currentUpvotes: number) => {
    if (!auth.currentUser) throw new Error("Must be logged in");
    try {
      const upvoteRef = doc(db, 'reports', reportId, 'upvotes', auth.currentUser.uid);
      const snap = await getDoc(upvoteRef);
      if (snap.exists()) {
        await deleteDoc(upvoteRef);
        await updateDoc(doc(db, 'reports', reportId), {
          upvotes: increment(-1)
        });
      } else {
        await setDoc(upvoteRef, {
          userId: auth.currentUser.uid,
          createdAt: new Date().toISOString()
        });
        await updateDoc(doc(db, 'reports', reportId), {
          upvotes: increment(1)
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
    }
  };

  const deleteReport = async (reportId: string) => {
    if (!auth.currentUser) throw new Error("Must be logged in");
    try {
      await deleteDoc(doc(db, 'reports', reportId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `reports/${reportId}`);
    }
  };

  return { reports, addReport, upvoteReport, deleteReport };
}
