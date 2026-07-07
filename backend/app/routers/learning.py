from fastapi import APIRouter, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbDep, get_owned_or_404
from app.models.learning import LearningGoal, LearningMilestone
from app.schemas.learning import (
    GoalCreate,
    GoalOut,
    GoalStatusChange,
    GoalUpdate,
    MilestoneCreate,
    MilestoneOut,
    MilestoneUpdate,
)

router = APIRouter(prefix="/api/learning", tags=["learning"])


def _get_goal(db: DbDep, user_id: int, goal_id: int) -> LearningGoal:
    return get_owned_or_404(
        db,
        LearningGoal,
        user_id,
        goal_id,
        options=(selectinload(LearningGoal.milestones),),
        detail="Goal not found",
    )


# --- Goals ------------------------------------------------------------------------


@router.get("/goals", response_model=list[GoalOut])
def list_goals(current_user: CurrentUser, db: DbDep) -> list[LearningGoal]:
    """Active goals first, then paused, done last; newest first within a status."""
    status_rank = {"active": 0, "paused": 1, "done": 2}
    goals = list(
        db.scalars(
            select(LearningGoal)
            .options(selectinload(LearningGoal.milestones))
            .where(LearningGoal.user_id == current_user.id)
        )
    )
    goals.sort(key=lambda g: (status_rank.get(g.status, 3), -g.id))
    return goals


@router.post("/goals", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(payload: GoalCreate, current_user: CurrentUser, db: DbDep) -> LearningGoal:
    goal = LearningGoal(
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        target_date=payload.target_date,
    )
    for position, milestone in enumerate(payload.milestones):
        goal.milestones.append(
            LearningMilestone(
                user_id=current_user.id,
                title=milestone.title,
                due_date=milestone.due_date,
                position=position,
            )
        )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.put("/goals/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: int, payload: GoalUpdate, current_user: CurrentUser, db: DbDep
) -> LearningGoal:
    goal = _get_goal(db, current_user.id, goal_id)
    for field, value in payload.model_dump().items():
        setattr(goal, field, value)
    db.commit()
    db.refresh(goal)
    return goal


@router.post("/goals/{goal_id}/status", response_model=GoalOut)
def change_goal_status(
    goal_id: int, payload: GoalStatusChange, current_user: CurrentUser, db: DbDep
) -> LearningGoal:
    goal = _get_goal(db, current_user.id, goal_id)
    goal.status = payload.status
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, current_user: CurrentUser, db: DbDep) -> None:
    goal = _get_goal(db, current_user.id, goal_id)
    db.delete(goal)
    db.commit()


# --- Milestones -------------------------------------------------------------------


@router.post(
    "/goals/{goal_id}/milestones",
    response_model=MilestoneOut,
    status_code=status.HTTP_201_CREATED,
)
def add_milestone(
    goal_id: int, payload: MilestoneCreate, current_user: CurrentUser, db: DbDep
) -> LearningMilestone:
    goal = _get_goal(db, current_user.id, goal_id)
    next_position = db.scalar(
        select(func.coalesce(func.max(LearningMilestone.position), -1)).where(
            LearningMilestone.goal_id == goal.id
        )
    )
    milestone = LearningMilestone(
        user_id=current_user.id,
        goal_id=goal.id,
        title=payload.title,
        due_date=payload.due_date,
        position=next_position + 1,
    )
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
    return milestone


@router.put("/milestones/{milestone_id}", response_model=MilestoneOut)
def update_milestone(
    milestone_id: int, payload: MilestoneUpdate, current_user: CurrentUser, db: DbDep
) -> LearningMilestone:
    milestone = get_owned_or_404(
        db, LearningMilestone, current_user.id, milestone_id, detail="Milestone not found"
    )
    for field, value in payload.model_dump().items():
        setattr(milestone, field, value)
    db.commit()
    db.refresh(milestone)
    return milestone


@router.post("/milestones/{milestone_id}/toggle", response_model=MilestoneOut)
def toggle_milestone(
    milestone_id: int, current_user: CurrentUser, db: DbDep
) -> LearningMilestone:
    milestone = get_owned_or_404(
        db, LearningMilestone, current_user.id, milestone_id, detail="Milestone not found"
    )
    milestone.done = not milestone.done
    db.commit()
    db.refresh(milestone)
    return milestone


@router.delete("/milestones/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_milestone(milestone_id: int, current_user: CurrentUser, db: DbDep) -> None:
    milestone = get_owned_or_404(
        db, LearningMilestone, current_user.id, milestone_id, detail="Milestone not found"
    )
    db.delete(milestone)
    db.commit()
