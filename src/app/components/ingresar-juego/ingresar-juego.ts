import { Component, OnInit, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { firstValueFrom } from 'rxjs';
import { Router, RouterModule } from '@angular/router';
import { Service, Equipo } from '../../services/data';

function distintos(control: AbstractControl): ValidationErrors | null {
  const v = control.get('visitante')?.value;
  const l = control.get('local')?.value;
  if (!v || !l) return null;
  return v === l ? { mismosEquipos: true } : null;
}

@Component({
  selector: 'app-ingresar-juego',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatSelectModule, 
    MatButtonModule,
    MatDatepickerModule, 
    MatNativeDateModule,
    RouterModule,
    MatIconModule,
    MatDividerModule,
    MatMenuModule
  ],
  templateUrl: './ingresar-juego.html',
  styleUrls: ['./ingresar-juego.css'],
})
export class IngresarJuego implements OnInit {
  private fb = inject(FormBuilder);
  private svc = inject(Service);

  constructor(private service: Service, private router: Router) {}


  equipos: Equipo[] = [];
  loading = false;
  errorMsg: string | null = null;

  form = this.fb.group({
    visitante: ['', Validators.required],
    local: ['', Validators.required],
    fecha: [null as Date | null, Validators.required],
    hora:  ['', [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)]],
  }, { validators: [distintos] });

  ngOnInit(): void {
    this.svc.getEquipos().subscribe({
      next: (eqs) => this.equipos = eqs ?? [],
      error: (e) => this.errorMsg = e?.message || 'No fue posible cargar equipos',
    });
  }

  get f() { return this.form.controls; }

  onFechaTyped(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    const d = this.parseYYYYMMDD(v);
    if (d) this.form.get('fecha')?.setValue(d);
  }

  onFechaPicked(e: MatDatepickerInputEvent<Date>) {
    const d = e.value ?? null;
    this.form.get('fecha')?.setValue(d);
  }

  async guardar() {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading = true;
    this.errorMsg = null;

    const { visitante, local, fecha, hora } = this.form.value;

    try {
      const fechaStr = this.formatYYYYMMDD(fecha as Date);

      await firstValueFrom(this.svc.crearJuego({
        visitante: String(visitante),
        local: String(local),
        fecha: fechaStr,
        hora: String(hora),
      }));

      this.form.reset();
    } catch (err: any) {
      this.errorMsg = err?.message || 'No fue posible crear el juego';
    } finally {
      this.loading = false;
    }
  }

  private parseYYYYMMDD(s: string): Date | null {
    if (!s) return null;
    const clean = s.trim().replace(/-/g, '/');
    const m = clean.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d);
    return (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) ? dt : null;
  }

  private formatYYYYMMDD(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }
    
  logout(): void {
    this.service.logout();
    this.router.navigate(['/login']);
  }  


}
