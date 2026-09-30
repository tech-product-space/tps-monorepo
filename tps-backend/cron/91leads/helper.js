function formatNextFollowup(preferredDate, preferredTime) {
  // Combine date and time into a single string
  const dateTimeString = `${preferredDate} ${preferredTime}`;

  // Create Date object
  const date = new Date(dateTimeString);

  // Format to YYYY-MM-DDTHH:mm:ss
  const formatted =
    date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0") + "T" +
    String(date.getHours()).padStart(2, "0") + ":" +
    String(date.getMinutes()).padStart(2, "0") + ":00";

  return formatted;
}

module.exports = {formatNextFollowup}