export const floorOptions = (floors) => {
  const list = ["Ground Floor"];
  for (let i = 1; i < (floors || 1); i++) list.push(`Floor ${i}`);
  list.push("Rooftop");
  return list;
};
