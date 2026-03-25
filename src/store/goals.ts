import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { Goal, GoalEvent, GoalWithStreak } from '../types';

interface GoalsState {
  goals: Goal[];
  goalsWithStreaks: GoalWithStreak[];
  goalEvents: GoalEvent[];
  isLoading: boolean;

  fetchGoals: () => Promise<void>;
  fetchGoalsWithStreaks: () => Promise<void>;
  fetchGoalEvents: (goalId?: string) => Promise<void>;
  createGoal: (goal: Omit<Goal, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  updateGoal: (id: string, updates: Partial<Goal>) => Promise<void>;
  toggleGoal: (id: string, isActive: boolean) => Promise<void>;
}

export const useGoalsStore = create<GoalsState>((set, get) => ({
  goals: [],
  goalsWithStreaks: [],
  goalEvents: [],
  isLoading: false,

  fetchGoals: async () => {
    const { data } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) set({ goals: data as Goal[] });
  },

  fetchGoalsWithStreaks: async () => {
    set({ isLoading: true });
    try {
      const { data: goals } = await supabase
        .from('goals')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (!goals) return;

      const withStreaks: GoalWithStreak[] = await Promise.all(
        (goals as Goal[]).map(async (goal) => {
          const { data } = await supabase.rpc('get_goal_streak', {
            p_goal_id: goal.id,
          });
          return { ...goal, streak: data ?? 0 };
        }),
      );

      set({ goalsWithStreaks: withStreaks });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchGoalEvents: async (goalId) => {
    let query = supabase
      .from('goal_events')
      .select('*')
      .order('entry_date', { ascending: false })
      .limit(50);

    if (goalId) query = query.eq('goal_id', goalId);

    const { data } = await query;
    if (data) set({ goalEvents: data as GoalEvent[] });
  },

  createGoal: async (goal) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { error } = await supabase.from('goals').insert({
      ...goal,
      user_id: userData.user.id,
    });

    if (error) throw error;
    await get().fetchGoals();
    await get().fetchGoalsWithStreaks();
  },

  updateGoal: async (id, updates) => {
    const { error } = await supabase.from('goals').update(updates).eq('id', id);
    if (error) throw error;
    await get().fetchGoals();
    await get().fetchGoalsWithStreaks();
  },

  toggleGoal: async (id, isActive) => {
    await supabase.from('goals').update({ is_active: isActive }).eq('id', id);
    await get().fetchGoals();
    await get().fetchGoalsWithStreaks();
  },
}));
