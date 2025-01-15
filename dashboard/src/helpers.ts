
export function truncateDbName(name: string, maxLength: number) {
    if (name.length <= maxLength) return name;
    return `${name.substring(0, maxLength - 3)}...`;
  }
