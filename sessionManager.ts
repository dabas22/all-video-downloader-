export class SessionManager {
  private static SESSION_KEY = 'downloader_session';
  private static HISTORY_KEY = 'downloader_history';

  static getSessionId(): string {
    let sessionId = localStorage.getItem(this.SESSION_KEY);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem(this.SESSION_KEY, sessionId);
    }
    return sessionId;
  }

  static getHistory(): Array<{
    url: string;
    type: string;
    timestamp: string;
  }> {
    const history = localStorage.getItem(this.HISTORY_KEY);
    return history ? JSON.parse(history) : [];
  }

  static addToHistory(url: string, type: string) {
    const history = this.getHistory();
    history.push({
      url,
      type,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
  }

  static clearHistory() {
    localStorage.removeItem(this.HISTORY_KEY);
  }
} 