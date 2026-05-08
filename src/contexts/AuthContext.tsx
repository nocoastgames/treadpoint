import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  role: 'basic' | 'advanced' | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, role: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'basic' | 'advanced' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        
        let currentRole: 'basic' | 'advanced' = 'basic';
        let shouldUpdateDoc = false;

        if (docSnap.exists()) {
          currentRole = docSnap.data().role as 'basic' | 'advanced';
          // Check if we need to upgrade them automatically
          if (user.email === 'mrenegar@gmail.com' && currentRole !== 'advanced') {
            currentRole = 'advanced';
            shouldUpdateDoc = true;
          }
        } else {
          // Document doesn't exist, create it
          if (user.email === 'mrenegar@gmail.com') {
            currentRole = 'advanced';
          }
          shouldUpdateDoc = true;
        }

        if (shouldUpdateDoc) {
          try {
            await setDoc(docRef, {
              email: user.email,
              role: currentRole,
              createdAt: new Date().toISOString()
            }, { merge: true });
          } catch (e) {
            console.error("Error setting user document:", e);
          }
        }

        setRole(currentRole);
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
