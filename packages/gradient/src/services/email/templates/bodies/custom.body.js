export default function customBody(content, variables = {}) {
  let result = content;

  Object.keys(variables).forEach((key) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    result = result.replace(regex, variables[key]);
  });

  return result;
}
