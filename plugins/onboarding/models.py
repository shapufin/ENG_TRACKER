from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db import models

from apps.overtime.models.core import Client
from core.models.abstract import BaseModel

MAX_FOLDER_DEPTH = 10
SEARCH_RESULT_LIMIT = 25


class Folder(BaseModel):
    client = models.ForeignKey(
        Client, on_delete=models.CASCADE, related_name='onboarding_folders'
    )
    parent = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.CASCADE, related_name='children'
    )
    name = models.CharField(max_length=255)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='onboarding_folders_created'
    )
    updated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='onboarding_folders_updated',
    )

    class Meta:
        db_table = 'onboarding_folders'
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['client', 'parent', 'name'], name='onboarding_folder_unique_name_per_parent'
            ),
        ]
        indexes = [models.Index(fields=['client', 'parent'])]

    def __str__(self):
        return self.name

    def clean(self):
        # UniqueConstraint(client, parent, name) never fires for root folders:
        # SQL treats NULL != NULL, so two parent=None rows with the same name
        # never collide at the DB level. Check explicitly for every case.
        duplicate = Folder.objects.filter(
            client_id=self.client_id, parent_id=self.parent_id, name=self.name
        ).exclude(pk=self.pk)
        if duplicate.exists():
            raise ValidationError('A folder with this name already exists here.')

        if self.parent_id is None:
            return
        if self.pk is not None and self.parent_id == self.pk:
            raise ValidationError('A folder cannot be its own parent.')
        depth = 1
        node = self.parent
        while node is not None:
            if self.pk is not None and node.pk == self.pk:
                raise ValidationError('A folder cannot be moved into its own descendant.')
            depth += 1
            if depth > MAX_FOLDER_DEPTH:
                raise ValidationError(f'Folders cannot be nested deeper than {MAX_FOLDER_DEPTH} levels.')
            node = node.parent

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class Document(BaseModel):
    client = models.ForeignKey(
        Client, on_delete=models.CASCADE, related_name='onboarding_documents'
    )
    folder = models.ForeignKey(
        Folder, null=True, blank=True, on_delete=models.CASCADE, related_name='documents'
    )
    name = models.CharField(max_length=255)
    file = models.FileField(
        upload_to='onboarding/%Y/%m/',
        validators=[FileExtensionValidator(allowed_extensions=[
            'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp',
            'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip',
        ])],
    )
    size_bytes = models.PositiveIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='onboarding_documents_uploaded'
    )
    updated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='onboarding_documents_updated',
    )

    class Meta:
        db_table = 'onboarding_documents'
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['client', 'folder', 'name'], name='onboarding_document_unique_name_per_folder'
            ),
        ]
        indexes = [models.Index(fields=['client', 'folder'])]

    def __str__(self):
        return self.name

    def clean(self):
        # Same NULL-collision gap as Folder: folder=None never collides via
        # the DB unique constraint, so duplicates at client-root must be
        # checked explicitly.
        duplicate = Document.objects.filter(
            client_id=self.client_id, folder_id=self.folder_id, name=self.name
        ).exclude(pk=self.pk)
        if duplicate.exists():
            raise ValidationError('A document with this name already exists here.')

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
