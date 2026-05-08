import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface NomadRequest {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  state: string;
  message: string;
  createdAt: string;
}

export function useNomadRequests() {
  const [nomadRequests, setNomadRequests] = useState<NomadRequest[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setNomadRequests([]);
      return;
    }
    const q = query(collection(db, 'nomadRequests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNomadRequests(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as NomadRequest[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'nomadRequests'));

    return () => unsubscribe();
  }, [user]);

  const addNomadRequest = async (request: Omit<NomadRequest, 'id' | 'createdAt' | 'userId'>) => {
    if (!auth.currentUser) throw new Error("Must be logged in.");
    try {
      const d = await addDoc(collection(db, 'nomadRequests'), {
        ...request,
        userId: auth.currentUser.uid,
        createdAt: new Date().toISOString()
      });
      return d.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'nomadRequests');
      throw e;
    }
  };

  const deleteNomadRequest = async (id: string) => {
    if (!auth.currentUser) throw new Error("Must be logged in");
    try {
      await deleteDoc(doc(db, 'nomadRequests', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `nomadRequests/${id}`);
    }
  };

  return { nomadRequests, addNomadRequest, deleteNomadRequest };
}
