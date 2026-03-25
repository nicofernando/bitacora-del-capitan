import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleDailyReminder(hour: number) {
  await Notifications.cancelAllScheduledNotificationsAsync();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Bitácora del Capitán',
      body: '¿Cómo fue tu día? Aún no registraste nada.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
    },
  });
}

export async function scheduleStreakNotification(goalName: string, streak: number) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Bitácora del Capitán',
      body: `${goalName}: ¡${streak} días! Seguí así.`,
    },
    trigger: null, // immediate
  });
}

export async function scheduleRelapseFollowUp(goalName: string) {
  const trigger = new Date();
  trigger.setHours(trigger.getHours() + 1);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Bitácora del Capitán',
      body: `Ayer hubo una recaída en ${goalName}. ¿Qué aprendiste?`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: trigger,
    },
  });
}

export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
