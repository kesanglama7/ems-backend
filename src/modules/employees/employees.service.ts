///<reference types="multer" />
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';


import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeWorkMode, Prisma, Role, UserStatus } from '@prisma/client';
import { EmployeeListQueryDto } from './dto/employee-list-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { StorageService } from '../storage/storage.service';
import { PROFILE_IMAGE_ALLOWED_MIME_TYPES, PROFILE_IMAGE_MAX_SIZE } from './constants/profile-image.constants';
import { getProfileImageExtension } from './utils/profile-image.util';
import { randomUUID } from 'crypto';

@Injectable()
export class EmployeesService {
    private readonly logger = new Logger(
        EmployeesService.name,
    );
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  private async uploadProfileImage(
    employeeId: string,
    currentProfileImagePath: string | null,
    file: Express.Multer.File,
    ) {
    if (!file) {
        throw new BadRequestException(
        'Profile image is required.',
        );
    }

    if (
        !PROFILE_IMAGE_ALLOWED_MIME_TYPES.includes(
        file.mimetype as
            (typeof PROFILE_IMAGE_ALLOWED_MIME_TYPES)[number],
        )
    ) {
        throw new BadRequestException(
        'Only JPEG, PNG, and WebP images are allowed.',
        );
    }

    if (file.size > PROFILE_IMAGE_MAX_SIZE) {
        throw new BadRequestException(
        'Profile image must not exceed 5 MB.',
        );
    }

    const extension =
        getProfileImageExtension(file.mimetype);

    if (!extension) {
        throw new BadRequestException(
        'Unsupported profile image type.',
        );
    }

    const requestedStoragePath =
        `employees/${employeeId}/profile/` +
        `${randomUUID()}.${extension}`;

    const uploadedFile =
        await this.storageService.uploadFile({
        storagePath: requestedStoragePath,
        file: file.buffer,
        contentType: file.mimetype,
        });

    try {
        await this.prisma.employee.update({
        where: {
            id: employeeId,
        },
        data: {
            profileImagePath:
            uploadedFile.storagePath,
        },
        });
    } catch (error) {
        try {
        await this.storageService.deleteFile(
            uploadedFile.storagePath,
            uploadedFile.bucket,
        );
        } catch {
        // Preserve original DB error.
        }

        throw error;
    }

    if (
        currentProfileImagePath &&
        currentProfileImagePath !==
        uploadedFile.storagePath
    ) {
        try {
        await this.storageService.deleteFile(
            currentProfileImagePath,
        );
        } catch {
        // New image is already valid.
        // Old-file cleanup failure should not undo replacement.
        }
    }

    const signedUrl =
        await this.storageService.createSignedUrl(
        uploadedFile.storagePath,
        );

    return {
        success: true,
        message: 'Profile image uploaded successfully.',
        data: {
        profileImageUrl: signedUrl.url,
        },
    };
    }

  //create: employee
  async create(dto: CreateEmployeeDto) {
    const email = dto.email.trim().toLowerCase();
    const existingUser =
      await this.prisma.user.findUnique({
        where: {
          email,
        },
        select: {
          id: true,
        },
      });

    if (existingUser) {
      throw new ConflictException(
        'An employee with this email already exists.',
      );
    }
    if (dto.departmentId) {
      const department =
        await this.prisma.department.findUnique({
          where: {
            id: dto.departmentId,
          },
          select: {
            id: true,
            isActive: true,
          },
        });

      if (!department) {
        throw new NotFoundException(
          'Department not found.',
        );
      }

      if (!department.isActive) {
        throw new BadRequestException(
          'Cannot assign an employee to an inactive department.',
        );
      }
    }

    let dateOfJoining: Date | null = null;

    if (dto.dateOfJoining) {
      dateOfJoining = new Date(dto.dateOfJoining);

      if (Number.isNaN(dateOfJoining.getTime())) {
        throw new BadRequestException(
          'The joining date is invalid.',
        );
      }
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      10,
    );

    const maximumAttempts = 3;

    for (
      let attempt = 1;
      attempt <= maximumAttempts;
      attempt++
    ) {
      try {
        const result =
          await this.prisma.$transaction(
            async (tx) => {

              const lastEmployee =
                await tx.employee.findFirst({
                  orderBy: {
                    employeeCode: 'desc',
                  },
                  select: {
                    employeeCode: true,
                  },
                });

              const lastEmployeeNumber =
                this.extractEmployeeNumber(
                  lastEmployee?.employeeCode,
                );

              const employeeCode =
                this.formatEmployeeCode(
                  lastEmployeeNumber + 1,
                );

              const user = await tx.user.create({
                data: {
                  email,
                  passwordHash,
                  role: Role.EMPLOYEE,
                },
                select: {
                  id: true,
                  email: true,
                  role: true,
                  status: true,
                },
              });

              const employee =
                await tx.employee.create({
                  data: {
                    employeeCode,
                    firstName:
                      dto.firstName.trim(),
                    lastName:
                      dto.lastName.trim(),
                    phone:
                      dto.phone?.trim() || null,
                    jobTitle:
                      dto.jobTitle?.trim() || null,
                    dateOfJoining,
                    workMode:
                      dto.workMode ??
                      EmployeeWorkMode.ON_FIELD,
                    departmentId:
                      dto.departmentId ?? null,
                    userId: user.id,
                  },
                  include: {
                    department: {
                      select: {
                        id: true,
                        name: true,
                        isActive: true,
                      },
                    },
                  },
                });

              return {
                user,
                employee,
              };
            },
            {
              isolationLevel:
                Prisma.TransactionIsolationLevel
                  .Serializable,
            },
          );

        return {
          success: true,
          message:
            'Employee created successfully.',
          data: {
            ...result.employee,
            user: result.user,
          },
        };
      } catch (error: unknown) {
        this.logger.error(
          `Employee creation failed for ${email}. ` +
            `Attempt ${attempt}/${maximumAttempts}.`,
          error instanceof Error
            ? error.stack
            : String(error),
        );
        if (
          error instanceof
            Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const target =
            this.getPrismaErrorTarget(error);

          if (target.includes('email')) {
            throw new ConflictException(
              'An employee with this email already exists.',
            );
          }

          if (
            target.includes('employeeCode') &&
            attempt < maximumAttempts
          ) {
            continue;
          }

          if (target.includes('employeeCode')) {
            throw new ConflictException(
              'Unable to generate a unique employee code. Please try again.',
            );
          }

          throw new ConflictException(
            'An employee with these details already exists.',
          );
        }
        if (
          error instanceof
            Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003'
        ) {
          throw new BadRequestException(
            'The selected department is no longer available.',
          );
        }

        if (
          error instanceof
            Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          if (attempt < maximumAttempts) {
            continue;
          }

          throw new ConflictException(
            'Another employee was created at the same time. Please try again.',
          );
        }

        if (
          error instanceof
          Prisma.PrismaClientInitializationError
        ) {
          throw new BadRequestException(
            'The database is currently unavailable.',
          );
        }

        throw error;
      }
    }

    throw new ConflictException(
      'Employee creation could not be completed. Please try again.',
    );
  }

  private extractEmployeeNumber(
    employeeCode?: string,
  ): number {
    if (!employeeCode) {
      return 0;
    }

    const match =
      /^EMP-(\d+)$/.exec(employeeCode);

    if (!match) {
      this.logger.warn(
        `Unexpected employee code format: ${employeeCode}`,
      );

      return 0;
    }

    const employeeNumber = Number(match[1]);

    return Number.isSafeInteger(employeeNumber)
      ? employeeNumber
      : 0;
  }

  private formatEmployeeCode(
    employeeNumber: number,
  ): string {
    return `EMP-${String(employeeNumber).padStart(
      4,
      '0',
    )}`;
  }

  private getPrismaErrorTarget(
    error: Prisma.PrismaClientKnownRequestError,
  ): string {
    const target = error.meta?.target;

    if (Array.isArray(target)) {
      return target.join(',');
    }

    return typeof target === 'string'
      ? target
      : '';
  }

  //get: all
  async findAll(query: EmployeeListQueryDto) {
    const page = query.page;
    const limit = query.limit;

    const skip = (page - 1) * limit;

    const search = query.search?.trim();

    const where = {
        ...(query.departmentId && {
        departmentId: query.departmentId,
        }),

        ...(query.workMode && {
        workMode: query.workMode,
        }),

        ...(query.status && {
        user: {
            is: {
            status: query.status,
            },
        },
        }),

        ...(search && {
        OR: [
            {
            firstName: {
                contains: search,
                mode: 'insensitive' as const,
            },
            },
            {
            lastName: {
                contains: search,
                mode: 'insensitive' as const,
            },
            },
            {
            employeeCode: {
                contains: search,
                mode: 'insensitive' as const,
            },
            },
            {
            user: {
                is: {
                email: {
                    contains: search,
                    mode: 'insensitive' as const,
                },
                },
            },
            },
        ],
        }),
    };

    const [employees, total] =
        await this.prisma.$transaction([
        this.prisma.employee.findMany({
            where,
            skip,
            take: limit,

            orderBy: {
            createdAt: 'desc',
            },

            include: {
            department: {
                select: {
                id: true,
                name: true,
                isActive: true,
                },
            },

            user: {
                select: {
                id: true,
                email: true,
                role: true,
                status: true,
                },
            },
            },
        }),

        this.prisma.employee.count({
            where,
        }),
        ]);
    
        const employeesWithProfileImage =
        await Promise.all(
            employees.map(async (employee) => {
            let profileImageUrl: string | null =
                null;

            if (employee.profileImagePath) {
                const signedUrl =
                await this.storageService.createSignedUrl(
                    employee.profileImagePath,
                );

                profileImageUrl = signedUrl.url;
            }

            const {
                profileImagePath,
                ...employeeData
            } = employee;

            return {
                ...employeeData,
                profileImageUrl,
            };
            }),
        );

    return {
        success: true,
        data: employeesWithProfileImage,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
    }

    //get: id
    async findOne(employeeId: string) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            id: employeeId,
        },

        include: {
            department: {
            select: {
                id: true,
                name: true,
                description: true,
                isActive: true,
            },
            },

            user: {
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
                createdAt: true,
                updatedAt: true,
            },
            },
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee not found.',
        );
    }

    let profileImageUrl: string | null = null;

    if (employee.profileImagePath) {
        const signedUrl =
        await this.storageService.createSignedUrl(
            employee.profileImagePath,
        );

        profileImageUrl = signedUrl.url;
    }

    const {
        profileImagePath,
        ...employeeData
    } = employee;

    return {
        success: true,
        data: {
        ...employeeData,
        profileImageUrl,
        },
    };
    }

    //Patch: id
    async update(
    employeeId: string,
    dto: UpdateEmployeeDto,
    ) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            id: employeeId,
        },
        select: {
            id: true,
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee not found.',
        );
    }

    if (
        dto.departmentId !== undefined &&
        dto.departmentId !== null
    ) {
        const department =
        await this.prisma.department.findUnique({
            where: {
            id: dto.departmentId,
            },
            select: {
            id: true,
            isActive: true,
            },
        });

        if (!department) {
        throw new NotFoundException(
            'Department not found.',
        );
        }

        if (!department.isActive) {
        throw new BadRequestException(
            'Cannot assign employee to an inactive department.',
        );
        }
    }

    const updatedEmployee =
        await this.prisma.employee.update({
        where: {
            id: employeeId,
        },

        data: {
            ...(dto.firstName !== undefined && {
            firstName: dto.firstName.trim(),
            }),

            ...(dto.lastName !== undefined && {
            lastName: dto.lastName.trim(),
            }),

            ...(dto.phone !== undefined && {
            phone: dto.phone.trim() || null,
            }),

            ...(dto.jobTitle !== undefined && {
            jobTitle:
                dto.jobTitle.trim() || null,
            }),

            ...(dto.departmentId !== undefined && {
            departmentId: dto.departmentId,
            }),

            ...(dto.dateOfJoining !== undefined && {
            dateOfJoining:
                dto.dateOfJoining === null
                ? null
                : new Date(dto.dateOfJoining),
            }),

            ...(dto.workMode !== undefined && {
            workMode: dto.workMode,
            }),
        },

        include: {
            department: {
            select: {
                id: true,
                name: true,
                isActive: true,
            },
            },

            user: {
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
            },
            },
        },
        });

    return {
        success: true,
        message: 'Employee updated successfully.',
        data: updatedEmployee,
    };
    }

    //Update status
    async updateStatus(
    employeeId: string,
    dto: UpdateEmployeeStatusDto,
    ) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            id: employeeId,
        },
        select: {
            id: true,
            userId: true,
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee not found.',
        );
    }

    const user =
        await this.prisma.user.update({
        where: {
            id: employee.userId,
        },
        data: {
            status: dto.status,
        },
        select: {
            id: true,
            email: true,
            role: true,
            status: true,
        },
        });

    return {
        success: true,
        message: 'Employee status updated successfully.',
        data: {
        employeeId: employee.id,
        user,
        },
    };
    }

    //GET- employee me only
    async findMe(userId: string) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            userId,
        },

        include: {
            department: {
            select: {
                id: true,
                name: true,
                description: true,
                isActive: true,
            },
            },

            user: {
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
            },
            },
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee profile not found.',
        );
    }

    let profileImageUrl: string | null = null;

    if (employee.profileImagePath) {
        const signedUrl =
        await this.storageService.createSignedUrl(
            employee.profileImagePath,
        );

        profileImageUrl = signedUrl.url;
    }

    const {
        profileImagePath,
        ...employeeData
        } = employee;

        return {
        success: true,
        data: {
            ...employeeData,
            profileImageUrl,
        },
    };
    }

    //GET- my department colleagues
    async findMyDepartmentColleagues(userId: string) {
    const currentEmployee =
        await this.prisma.employee.findUnique({
        where: { userId },
        select: { id: true, departmentId: true },
        });

    if (!currentEmployee) {
        throw new NotFoundException(
        'Employee profile not found.',
        );
    }

    if (!currentEmployee.departmentId) {
        return { success: true, data: [] };
    }

    const colleagues =
        await this.prisma.employee.findMany({
        where: {
            departmentId: currentEmployee.departmentId,
            id: { not: currentEmployee.id },
            user: {
            is: {
                status: UserStatus.ACTIVE,
            },
            },
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            profileImagePath: true,
        },
        orderBy: [
            { firstName: 'asc' },
            { lastName: 'asc' },
        ],
        });

    const withProfiles = await Promise.all(
        colleagues.map(async (emp) => {
        let profileImageUrl: string | null = null;

        if (emp.profileImagePath) {
            const signedUrl =
            await this.storageService.createSignedUrl(
                emp.profileImagePath,
            );
            profileImageUrl = signedUrl.url;
        }

        return {
            id: emp.id,
            firstName: emp.firstName,
            lastName: emp.lastName,
            jobTitle: emp.jobTitle,
            profileImageUrl,
        };
        }),
    );

    return { success: true, data: withProfiles };
    }

    //PATCH- me
    async updateMe(
    userId: string,
    dto: UpdateMyProfileDto,
    ) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            userId,
        },
        select: {
            id: true,
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee profile not found.',
        );
    }

    const updatedEmployee =
        await this.prisma.employee.update({
        where: {
            id: employee.id,
        },

        data: {
            ...(dto.phone !== undefined && {
            phone:
                dto.phone === null
                ? null
                : dto.phone.trim() || null,
            }),
        },

        include: {
            department: {
            select: {
                id: true,
                name: true,
                description: true,
                isActive: true,
            },
            },

            user: {
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
            },
            },
        },
        });

    return {
        success: true,
        message: 'Profile updated successfully.',
        data: updatedEmployee,
    };
    }

    //upload own profile
   async uploadMyProfileImage(
    userId: string,
    file: Express.Multer.File,
    ) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            userId,
        },
        select: {
            id: true,
            profileImagePath: true,
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee profile not found.',
        );
    }

    return this.uploadProfileImage(
        employee.id,
        employee.profileImagePath,
        file,
    );
    }

    //DELETE own profile
    async deleteMyProfileImage(userId: string) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            userId,
        },
        select: {
            id: true,
            profileImagePath: true,
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee profile not found.',
        );
    }

    if (!employee.profileImagePath) {
        throw new NotFoundException(
        'Profile image not found.',
        );
    }

    const storagePath = employee.profileImagePath;

    await this.storageService.deleteFile(
        storagePath,
    );

    await this.prisma.employee.update({
        where: {
        id: employee.id,
        },
        data: {
        profileImagePath: null,
        },
    });

    return {
        success: true,
        message: 'Profile image deleted successfully.',
        data: null,
    };
    }

    //Upload employee profile via admin
    async uploadEmployeeProfileImage(
    employeeId: string,
    file: Express.Multer.File,
    ) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            id: employeeId,
        },
        select: {
            id: true,
            profileImagePath: true,
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee not found.',
        );
    }

    return this.uploadProfileImage(
        employee.id,
        employee.profileImagePath,
        file,
    );
    }
}