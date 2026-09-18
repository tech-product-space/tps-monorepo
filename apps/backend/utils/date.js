function formatDataTime(dateString) {
  if (!dateString) return "";

  // Parse UTC date
  const date = new Date(dateString);

  // Add 5 hours 30 minutes for IST
  date.setMinutes(date.getMinutes() + 330);

  const day = date.getDate();
  const month = date.toLocaleString("en-IN", { month: "short" });
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");

  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${day} ${month} ${year}, ${hours
    .toString()
    .padStart(2, "0")}:${minutes} ${ampm}`;
}

module.exports = { formatDataTime };