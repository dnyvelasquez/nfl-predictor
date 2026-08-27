import { Component, OnInit, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { Router, RouterModule } from '@angular/router';
import { Service, Equipo, Juego, Etapa, ETAPAS } from '../../services/data';

interface GrupoFecha {
  fecha: string;
  juegos: Juego[];
}

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
    MatMenuModule,
    MatProgressSpinnerModule
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
  okMsg: string | null = null;

  etapas = ETAPAS;

  juegosAgrupados: GrupoFecha[] = [];
  currentWeekId: number | null = null;
  minWeek: number | null = null;
  maxWeek: number | null = null;
  listLoading = false;

  editForms: Record<string, FormGroup> = {};

  form = this.fb.group({
    visitante: ['', Validators.required],
    local: ['', Validators.required],
    fecha: [null as Date | null, Validators.required],
    hora:  ['', [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)]],
    etapa: ['regular' as Etapa, Validators.required],
  }, { validators: [distintos] });

  ngOnInit(): void {
    this.svc.getEquipos().subscribe({
      next: (eqs) => this.equipos = eqs ?? [],
      error: (e) => this.errorMsg = e?.message || 'No fue posible cargar equipos',
    });

    this.svc.getSemanaActualId().subscribe(sem => {
      this.svc.getExtremosSemanas().subscribe(lim => {
        this.minWeek = lim.min;
        this.maxWeek = lim.max;
        this.currentWeekId = sem ?? lim.min ?? null;
        if (this.currentWeekId !== null) this.loadGames();
      });
    });
  }

  get f() { return this.form.controls; }

  etapaLabel(etapa: Etapa): string {
    return this.etapas.find(e => e.value === etapa)?.label ?? etapa;
  }

  private loadGames(): void {
    if (this.currentWeekId === null) return;

    this.listLoading = true;
    this.svc.getJuegosPorSemanaId(this.currentWeekId).subscribe({
      next: (juegos) => {
        this.juegosAgrupados = this.agruparPorFecha(juegos);
        this.editForms = {};
      },
      error: (e) => {
        this.errorMsg = e?.message || 'No fue posible cargar los juegos';
        this.listLoading = false;
      },
      complete: () => this.listLoading = false,
    });
  }

  private agruparPorFecha(juegos: Juego[]): GrupoFecha[] {
    const gruposMap = new Map<string, Juego[]>();
    for (const j of juegos) {
      if (!gruposMap.has(j.fecha)) gruposMap.set(j.fecha, []);
      gruposMap.get(j.fecha)!.push(j);
    }
    return Array.from(gruposMap.entries())
      .map(([fecha, juegos]) => ({ fecha, juegos: juegos.sort((a, b) => a.hora.localeCompare(b.hora)) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  prevWeek(): void {
    if (this.currentWeekId === null || this.currentWeekId <= (this.minWeek ?? 0)) return;
    this.svc.getSemanaAnteriorId(this.currentWeekId).subscribe(id => {
      if (id !== null) { this.currentWeekId = id; this.loadGames(); }
    });
  }

  nextWeek(): void {
    if (this.currentWeekId === null || this.currentWeekId >= (this.maxWeek ?? 0)) return;
    this.svc.getSemanaSiguienteId(this.currentWeekId).subscribe(id => {
      if (id !== null) { this.currentWeekId = id; this.loadGames(); }
    });
  }

  startEdit(j: Juego): void {
    if (!this.editForms[j.id]) {
      this.editForms[j.id] = this.fb.group({
        visitante: [j.visitante, Validators.required],
        local: [j.local, Validators.required],
        fecha: [this.parseYYYYMMDD(j.fecha), Validators.required],
        hora: [j.hora, [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)]],
        etapa: [j.etapa ?? 'regular', Validators.required],
        resultadoLocal: [j.resultado_local],
        resultadoVisitante: [j.resultado_visitante],
      }, { validators: [distintos] });
    }
  }

  cancelEdit(j: Juego): void {
    delete this.editForms[j.id];
  }

  saveEdit(j: Juego): void {
    const fg = this.editForms[j.id];
    if (!fg || fg.invalid) { fg?.markAllAsTouched(); return; }

    const v = fg.value;
    const patch = {
      visitante: String(v.visitante),
      local: String(v.local),
      fecha: this.formatYYYYMMDD(v.fecha as Date),
      hora: String(v.hora),
      etapa: v.etapa as Etapa,
      resultado_local: v.resultadoLocal === '' || v.resultadoLocal === null || v.resultadoLocal === undefined ? null : Number(v.resultadoLocal),
      resultado_visitante: v.resultadoVisitante === '' || v.resultadoVisitante === null || v.resultadoVisitante === undefined ? null : Number(v.resultadoVisitante),
    };

    this.listLoading = true;
    this.errorMsg = null;
    this.okMsg = null;

    this.svc.actualizarJuego(j.id, patch).subscribe({
      next: () => {
        this.okMsg = 'Juego actualizado';
        this.loadGames();
      },
      error: (e) => {
        this.errorMsg = e?.message || 'No se pudo actualizar el juego';
        this.listLoading = false;
      },
    });
  }

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
    this.okMsg = null;

    const { visitante, local, fecha, hora, etapa } = this.form.value;

    try {
      const fechaStr = this.formatYYYYMMDD(fecha as Date);

      await firstValueFrom(this.svc.crearJuego({
        visitante: String(visitante),
        local: String(local),
        fecha: fechaStr,
        hora: String(hora),
        etapa: etapa as Etapa,
      }));

      this.form.reset();
      this.form.patchValue({ etapa: 'regular' });
      this.okMsg = 'Juego creado';
      this.loadGames();
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
