import { jwtDecode } from 'jwt-decode';

export function getDecodedRole(token: string): string | null {
  const decoded: any = jwtDecode(token);

  return (
    decoded['role'] ||
    decoded['roles'] ||
    decoded['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
    decoded['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role'] ||
    null
  );
}

