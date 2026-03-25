import { differenceInYears, differenceInDays, parseISO } from 'date-fns';

export function calculateAge(birthdate: string | null): number | null {
  if (!birthdate) return null;
  return differenceInYears(new Date(), parseISO(birthdate));
}

export function calculateProcessDay(processStartDate: string): number {
  return differenceInDays(new Date(), parseISO(processStartDate)) + 1;
}

export function getDeviceDatetime(): string {
  return new Date().toISOString();
}

export function getTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatDateShort(dateStr: string): string {
  const date = parseISO(dateStr);
  return date.toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
  });
}

export function formatDateFull(dateStr: string): string {
  const date = parseISO(dateStr);
  return date.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
