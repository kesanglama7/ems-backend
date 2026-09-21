# Compensatory leave allocations and dynamic notifications

## Deploy

Run the normal production migration before starting the new application build:

```bash
npm run db:migrate:deploy
```

Migration `20260921090000_add_per_employee_leave_allocation` adds the per-employee `assignedDays` value. Existing selected-leave assignments inherit their leave type's previous `yearlyAllowance`, so deployment does not erase current allocations.

## Create a compensatory leave type

Create any number of compensatory leave types through `POST /leave-types`. A type that will be given to individual employees should use:

```json
{
  "name": "Compensatory Leave",
  "description": "Time off granted for approved extra work.",
  "audience": "SELECTED",
  "yearlyAllowance": 0,
  "hasLimitedBalance": true,
  "allowHalfDay": true,
  "isEmployeeRequestable": true,
  "isPaid": true
}
```

## Allocate different days to employees

`POST /leave-types/:leaveTypeId/assignments` now accepts employee/day pairs:

```json
{
  "assignments": [
    {
      "employeeId": "<ram-employee-id>",
      "days": 4
    },
    {
      "employeeId": "<sita-employee-id>",
      "days": 2
    }
  ]
}
```

The operation is atomic. It creates or updates each assignment and the current year's balance. An allocation cannot be reduced below the employee's already-used plus pending days. Leave types that disallow half days accept whole-number allocations only.

Use `GET /leave-types/:leaveTypeId/assignments` to retrieve employees with their `assignedDays`. Use `DELETE /leave-types/:leaveTypeId/assignments` with the existing `employeeIds` array to remove eligibility; historical balances and leave requests remain preserved.

## Notifications

Notification rows and Firebase pushes now use the data from their linked entity rather than generic static copy. Depending on the event, the content includes the actual leave type, employee, dates and days; request number and subject; document title; attendance date; leave balance; resource and quantity; or announcement title and body.

Assigning or changing an employee's leave allocation also creates a `LEAVE_BALANCE_ADJUSTED` notification showing the actual leave name, year, and total days.
