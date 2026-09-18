export function formatDataTime(dateString: string): string {
  if (!dateString) return "";

  const date = new Date(dateString);

  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");

  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12; // convert 0 -> 12, 13 -> 1 etc.

  const formattedTime = `${hours.toString().padStart(2, "0")}:${minutes} ${ampm}`;

  return `${day} ${month} ${year}, ${formattedTime}`;
}


export function formatDateOnly(dateString: string): string {
  if (!dateString) return "";

  const date = new Date(dateString);

  const day = date.getDate().toString().padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
}