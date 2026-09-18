/**
 * @param {string} name - The name to capitalize
 * @returns {string} - capitalized name
 */
exports.capitalizeName = (name) => {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return name
    .trim()
    .split(/\s+/) 
    .map(word => {
      if (word.length === 0) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};