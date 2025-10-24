export interface NavItem {
  icon: string;
  label: string;
  route: string;
  requiresAuth: boolean; // Retained, but set to false for now
}