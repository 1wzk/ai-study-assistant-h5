// 历史记录优化：去重+缓存
if (!window.historyInitialized) {
    function initHistoryStorage() {
      if (!localStorage.getItem('ai_study_history')) {
        localStorage.setItem('ai_study_history', JSON.stringify([]));
      }
    }
  
    function saveHistoryWithDeduplication(text) {
      const history = JSON.parse(localStorage.getItem('ai_study_history') || '[]');
      const newHistory = history.filter(item => item.text !== text);
      newHistory.unshift({
        text: text,
        time: new Date().toLocaleString()
      });
      if (newHistory.length > 20) newHistory.pop();
      localStorage.setItem('ai_study_history', JSON.stringify(newHistory));
    }
  
    initHistoryStorage();
    window.historyInitialized = true;
    window.saveToHistory = saveHistoryWithDeduplication;
  }