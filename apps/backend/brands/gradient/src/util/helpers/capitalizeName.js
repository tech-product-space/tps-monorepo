export default function capitalizeName (name = "") {
  return name
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};