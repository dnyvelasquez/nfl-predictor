import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Service } from '../../services/data';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-nuevo-usuario',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './nuevo-usuario.html',
  styleUrls: ['./nuevo-usuario.css']
})
export class NuevoUsuario {
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private service: Service, 
    private router: Router,
  ) {
    this.form = this.fb.group({
      nombre: ['', Validators.required],
      contrasena: ['', Validators.required]
    });
  }

  onSubmit(): void {
    if (this.form.valid) {
      const { nombre, contrasena } = this.form.value;
      this.service.register(nombre!, contrasena!).subscribe(success => {
        if (success) {
          alert('✅ Usuario agregado exitosamente');
        } else {
          alert('❌ Usuario no agregado');
        }
      });
    }
  }

}