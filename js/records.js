// Your record, kept in this browser only. Test mode keeps a separate record.
(function () {
  const blank = () => ({ shifts: 0, deepestLevel: 0, timesCaught: 0, totalPoints: 0 });
  window.Records = function (test) {
    const key = test ? 'blockmine.records.test' : 'blockmine.records';
    let r = blank();
    try { Object.assign(r, JSON.parse(localStorage.getItem(key) || '{}')); } catch (e) {}
    return {
      get: () => r,
      save() { try { localStorage.setItem(key, JSON.stringify(r)); } catch (e) {} },
    };
  };
})();
