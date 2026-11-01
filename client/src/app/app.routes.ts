import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/register/register').then((m) => m.RegisterPage),
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./pages/forbidden/forbidden').then((m) => m.ForbiddenPage),
  },
  {
    path: 'admin/users',
    canActivate: [roleGuard('Admin')],
    loadComponent: () => import('./pages/admin-users/admin-users').then((m) => m.AdminUsersPage),
  },
  {
    path: 'admin/organizations',
    canActivate: [roleGuard('Admin')],
    loadComponent: () => import('./pages/admin-organizations/admin-organizations').then((m) => m.AdminOrganizationsPage),
  },
  {
    path: 'skills',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/skills/skills').then((m) => m.SkillsPage),
  },
  {
    path: 'organization/new',
    canActivate: [roleGuard('Vendor', 'Admin')],
    loadComponent: () => import('./pages/organization-form/organization-form').then((m) => m.OrganizationFormPage),
  },
  {
    path: 'organization',
    canActivate: [roleGuard('Vendor', 'Admin')],
    loadComponent: () => import('./pages/organization-form/organization-form').then((m) => m.OrganizationFormPage),
  },
  {
    path: 'requirements/new',
    canActivate: [roleGuard('Vendor', 'Admin')],
    loadComponent: () => import('./pages/requirement-form/requirement-form').then((m) => m.RequirementFormPage),
  },
  {
    path: 'requirements/:id/edit',
    canActivate: [roleGuard('Vendor', 'Admin')],
    loadComponent: () => import('./pages/requirement-form/requirement-form').then((m) => m.RequirementFormPage),
  },
  {
    path: 'requirements/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/requirement-detail/requirement-detail').then((m) => m.RequirementDetailPage),
  },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/marketplace/marketplace').then((m) => m.MarketplacePage),
  },
  { path: '**', redirectTo: '' },
];
