// Your record, kept in this browser only. Test mode keeps a separate record.
(function () {
  const blank = () => ({ shifts: 0, deepestLevel: 0, timesCaught: 0, totalPoints: 0 });
  // name: '' for the rope version (its original keys), 'cutaway' for the cutaway mine
  window.Records = function (test, name) {
    const key = 'blockmine.' + (name ? name + '.' : '') + 'records' + (test ? '.test' : '');
    let r = blank();
    try { Object.assign(r, JSON.parse(localStorage.getItem(key) || '{}')); } catch (e) {}
    return {
      get: () => r,
      save() { try { localStorage.setItem(key, JSON.stringify(r)); } catch (e) {} },
    };
  };
})();
