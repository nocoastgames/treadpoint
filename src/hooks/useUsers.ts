import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface UserProfile {
  id: string; // uid
  email: string;
  role: 'basic' | 'advanced';
  karma?: number;
  createdAt: string;
}

export function useUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const { user, role } = useAuth();

  useEffect(() => {
    if (!user) {
      setUsers([]);
      return;
    }
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserProfile[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => unsubscribe();
  }, [user]);

  const giveKarma = async (userId: string) => {
    if (!auth.currentUser) throw new Error("Must be logged in");
    if (role !== 'advanced') {
      alert("Only advanced users can give trail cred.");
      return;
    }
    try {
      await updateDoc(doc(db, 'users', userId), {
        karma: increment(1)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  return { users, giveKarma };
}
