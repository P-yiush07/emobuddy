export function formatDate(date: Date): string {
    const options: Intl.DateTimeFormatOptions = { 
      day: 'numeric', 
      month: 'long', 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    };
    return date.toLocaleString('en-US', options);
  }