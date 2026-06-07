const _cache = {};

export const getAnnot = (inspId) => _cache[inspId] || {};
export const setAnnot = (inspId, data) => { _cache[inspId] = data; };
export const getGroups = (inspId) => {
  try { const s = sessionStorage.getItem(`vida_groups_${inspId}`); return s ? JSON.parse(s) : []; }
  catch { return []; }
};
