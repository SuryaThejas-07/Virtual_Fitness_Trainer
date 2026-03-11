import { useState, useEffect } from "react";
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc, doc,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

type TimestampLike = { toDate: () => Date };
type SortableValue = TimestampLike | Date | number | string | null | undefined;

const toMillis = (value: SortableValue): number => {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return Date.parse(value) || 0;
  return value.toDate().getTime();
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
      setData(items);
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

/* ---- Helpers to add / delete docs ---- */
export async function addFirestoreDoc(collectionName: string, userId: string, data: Record<string, unknown>) {
  return addDoc(collection(db, collectionName), {
    ...data,
    user_id: userId,
  });
}

export async function deleteFirestoreDoc(collectionName: string, docId: string) {
  return deleteDoc(doc(db, collectionName, docId));
}
