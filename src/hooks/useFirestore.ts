import { useState, useEffect } from "react";
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc, doc,
  type DocumentData,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

type TimestampLike = { toDate: () => Date };
type SortableValue = TimestampLike | Date | number | string | null | undefined;

const toMillis = (value: SortableValue): number => {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return Date.parse(value) || 0;
  const valObj = value as Record<string, unknown>;
  if (valObj && typeof valObj.toDate === "function") {
    return (valObj.toDate as () => Date)().getTime();
  }
  if (valObj && typeof valObj.getTime === "function") {
    return (valObj.getTime as () => number)();
  }
  if (valObj && typeof valObj.seconds === "number") {
    return valObj.seconds * 1000 + Math.floor((Number(valObj.nanoseconds) || 0) / 1000000);
  }
  return 0;
};

export interface GoalDoc {
  id: string;
  daily_calories?: number;
  protein_target_g?: number;
  carbs_target_g?: number;
  fats_target_g?: number;
  [key: string]: unknown;
}

export interface BodyMetricDoc {
  id: string;
  recorded_at?: TimestampLike | Date;
  weight_kg?: number;
  body_fat_percentage?: number;
  muscle_mass_kg?: number;
  bmi?: number;
  [key: string]: unknown;
}

/* ---- Generic real-time collection listener ---- */
export function useFirestoreCollection<T extends { id: string }>(
  collectionName: string,
  orderField = "timestamp"
) {
  const { user } = useAuth();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setData([]); setLoading(false); return; }

    const localKey = `fitcoach_${user.uid}_${collectionName}`;

    // Load from cache first
    try {
      const cached = localStorage.getItem(localKey);
      if (cached) {
        setData(JSON.parse(cached));
        setLoading(false);
      }
    } catch (err) {
      console.error(`Failed to load cached ${collectionName}:`, err);
    }

    const q = query(
      collection(db, collectionName),
      where("user_id", "==", user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
      // Client-side sort by orderField descending (newest first)
      items.sort((a, b) => {
        const av = (a as Record<string, SortableValue>)[orderField];
        const bv = (b as Record<string, SortableValue>)[orderField];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const at = toMillis(av);
        const bt = toMillis(bv);
        return bt - at;
      });

      try {
        localStorage.setItem(localKey, JSON.stringify(items));
      } catch (err) {
        console.error(`Failed to cache ${collectionName}:`, err);
      }

      setData(items);
      setLoading(false);
    }, (error) => {
      console.error(`Firestore query error for ${collectionName}:`, error);
      // Keep cached data so it doesn't disappear when navigating or offline
      setLoading(false);
    });
    return unsub;
  }, [user, collectionName, orderField]);

  return { data, loading };
}

/* ---- User profile ---- */
export function useUserProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setProfile(null); setLoading(false); return; }
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    }, (error) => {
      console.error("Firestore user profile snapshot error:", error);
      setProfile(null);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  return { profile, loading };
}

/* ---- Goals ---- */
export function useGoals() {
  return useFirestoreCollection<GoalDoc>("goals");
}

/* ---- Body metrics ---- */
export function useBodyMetrics() {
  return useFirestoreCollection<BodyMetricDoc>("body_metrics", "recorded_at");
}

const sanitizeDoc = (data: Record<string, unknown>): Record<string, unknown> => {
  if (data == null) return data;
  const copy = { ...data };
  for (const key in copy) {
    const val = copy[key];
    if (val && typeof val === "object") {
      const valObj = val as Record<string, unknown>;
      // Check if it is a Firestore Timestamp
      if (typeof valObj.toDate === "function") {
        copy[key] = (valObj.toDate as () => Date)().toISOString();
      }
      // Check if it is a serverTimestamp placeholder
      else if (valObj._methodName === "serverTimestamp" || (valObj.constructor && valObj.constructor.name === "FieldValueImpl")) {
        copy[key] = new Date().toISOString();
      }
      // Check if it is a standard Date
      else if (val instanceof Date) {
        copy[key] = val.toISOString();
      }
    }
  }
  return copy;
};

/* ---- Helpers to add / delete docs ---- */
export async function addFirestoreDoc(collectionName: string, userId: string, data: Record<string, unknown>) {
  const docPromise = addDoc(collection(db, collectionName), {
    ...data,
    user_id: userId,
  });

  try {
    const docRef = await docPromise;
    const localKey = `fitcoach_${userId}_${collectionName}`;
    const cached = localStorage.getItem(localKey);
    const items = cached ? JSON.parse(cached) : [];
    const newItem = { id: docRef.id, ...sanitizeDoc(data), user_id: userId };
    localStorage.setItem(localKey, JSON.stringify([newItem, ...items]));
    return docRef;
  } catch (err) {
    console.error(`Local cache sync error during add to ${collectionName}:`, err);
    return docPromise;
  }
}

export async function deleteFirestoreDoc(collectionName: string, docId: string) {
  const deletePromise = deleteDoc(doc(db, collectionName, docId));

  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const localKey = `fitcoach_${currentUser.uid}_${collectionName}`;
      const cached = localStorage.getItem(localKey);
      if (cached) {
        const items = JSON.parse(cached) as { id: string }[];
        const filtered = items.filter((item) => item.id !== docId);
        localStorage.setItem(localKey, JSON.stringify(filtered));
      }
    }
  } catch (err) {
    console.error(`Local cache sync error during delete from ${collectionName}:`, err);
  }

  return deletePromise;
}
