import { Component, inject, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Service } from '../../services/data';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-borrar-usuario',
  standalone: true,
  imports: [
    ReactiveFormsModule, 
    MatCardModule, 
    MatButtonModule, 
    MatFormFieldModule, 
    MatInputModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    RouterModule
  ],
  templateUrl: './borrar-usuario.html',
  styleUrls: ['./borrar-usuario.css']
})
export class BorrarUsuario implements OnInit {

  private svc = inject(Service);
  private fb = inject(FormBuilder);

  constructor(private service: Service, private router: Router) {}


  loading = false;
  errorMsg: string | null = null;
  okMsg: string | null = null;

  page = 1;
  perPage = 20;
  q = '';

  // resultado
  users: Array<{ id: string; email: string | null; full_name: string | null; created_at: string; last_sign_in_at: string | null }> = [];

  search = this.fb.control('');

  ngOnInit(): void {
    this.load();
  }

  load(page = this.page, q = this.q) {
    this.loading = true;
    this.errorMsg = this.okMsg = null;
    this.svc.listUsers(page, this.perPage, q).subscribe({
      next: (res: any) => {
        if (res?.error) { this.errorMsg = res.error; return; }
        this.users = res.users ?? [];
        this.page  = res.page  ?? page;
        this.perPage = res.perPage ?? this.perPage;
      },
      error: (e) => this.errorMsg = e?.message || 'Error cargando usuarios',
      complete: () => this.loading = false
    });
  }

  doSearch() {
    this.q = this.search.value?.trim() || '';
    this.page = 1;
    this.load(1, this.q);
  }

  nextPage() { this.load(this.page + 1, this.q); }
  prevPage() { if (this.page > 1) this.load(this.page - 1, this.q); }

  confirmAndDelete(u: { id: string; email: string | null }) {
    const ok = confirm(`¿Eliminar al usuario ${u.email ?? u.id}? Esta acción no se puede deshacer.`);
    if (!ok) return;

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.svc.deleteUser(u.id).subscribe({
      next: (r: any) => {
        if (r?.error) { this.errorMsg = r.error; return; }
        this.okMsg = 'Usuario eliminado.';
        // refresca la lista
        this.load(this.page, this.q);
      },
      error: (e) => this.errorMsg = e?.message || 'No se pudo eliminar',
      complete: () => this.loading = false
    });
  }

  
  logout(): void {
    this.service.logout();
    this.router.navigate(['/login']);
  }  




}
